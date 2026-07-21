import "./style.css";

import {
    renderShell,
    renderListShell,
    renderListRow,
    renderTimelineShell,
    renderTimelineCard,
    renderProfileView,
    TOTAL_ENTITY_COUNT,
} from "./app";
import type { EntityProfile } from "./app";

import { store, patchProfile, describePatchError, deleteProfile, uploadIcon, buildIconUrl } from "./api";
import { createFeed, type Feed } from "./feed";
import { getStats, resetStats, subscribeStats } from "./stats";

const FEED_WINDOW_SIZE = 200;
const LIST_BATCH_SIZE = 50;
const TIMELINE_BATCH_SIZE = 20;

// タイムラインの「よく見られるID」プール。ここに偏らせることで、
// 同じIDへの再アクセス(=キャッシュヒット)が実際に発生するようにする。
// 完全一様ランダムだと同じIDが再出現する確率はほぼゼロで、
// ヒット率を見せるデモとして意味を持たない。
const HOT_POOL_SIZE = 200;
const HOT_POOL_RATIO = 0.8; // 8割はホットプールから、2割は完全ランダム

const root = document.querySelector<HTMLDivElement>("#app")!;
root.innerHTML = renderShell();

const view = document.querySelector<HTMLElement>("#view")!;

mountStatsPanel();

let activeFeed: Feed | null = null;

function teardownActiveFeed() {
    activeFeed?.destroy();
    activeFeed = null;
}

/* -------------------------------------------------------------------- */
/* 統計パネル(画面遷移をまたいで常設)                                      */
/* -------------------------------------------------------------------- */

function mountStatsPanel() {
    const requestedEl = document.querySelector<HTMLElement>("#stats-requested")!;
    const sentEl = document.querySelector<HTMLElement>("#stats-sent")!;
    const unchangedEl = document.querySelector<HTMLElement>("#stats-unchanged")!;
    const cacheHitRateEl = document.querySelector<HTMLElement>("#stats-cache-hit-rate")!;
    const networkEl = document.querySelector<HTMLElement>("#stats-network")!;

    const update = () => {
        const { requestedCount, networkRequestCount, sentIdCount, unchangedIdCount } = getStats();

        requestedEl.textContent = String(requestedCount);
        sentEl.textContent = String(sentIdCount);
        unchangedEl.textContent = String(unchangedIdCount);
        networkEl.textContent = String(networkRequestCount);

        // サーバーへ送った延べID数のうち、バージョン一致で本文が返らず
        // キャッシュがそのまま使い回された割合。
        cacheHitRateEl.textContent =
            sentIdCount === 0 ? "—" : `${Math.round((unchangedIdCount / sentIdCount) * 100)}%`;
    };

    subscribeStats(update);
    document.querySelector<HTMLButtonElement>("#stats-reset-btn")?.addEventListener("click", resetStats);

    update();
}

/* -------------------------------------------------------------------- */
/* 画面1: ユーザー一覧                                                    */
/* -------------------------------------------------------------------- */

function formatId(n: number): string {
    return `u${String(n).padStart(4, "0")}`;
}

function mountList() {
    teardownActiveFeed();

    view.innerHTML = renderListShell();

    let cursor = 0;
    const nextIds = (): string[] | null => {
        if (cursor >= TOTAL_ENTITY_COUNT) return null;

        const end = Math.min(cursor + LIST_BATCH_SIZE, TOTAL_ENTITY_COUNT);
        const ids = Array.from({ length: end - cursor }, (_, i) => formatId(cursor + i));
        cursor = end;

        return ids;
    };

    const container = view.querySelector<HTMLElement>("#feed-container")!;
    const sentinel = view.querySelector<HTMLElement>("#feed-sentinel")!;
    const loadedCountEl = view.querySelector<HTMLElement>("#list-loaded-count");

    activeFeed = createFeed({
        container,
        sentinel,
        windowSize: FEED_WINDOW_SIZE,
        nextIds,
        renderItem: renderListRow,
        onLoadedCountChange: (total) => {
            if (loadedCountEl) loadedCountEl.textContent = String(total);
        },
    });

    attachListHandlers(container);
}

function attachListHandlers(container: HTMLElement) {
    view.querySelector<HTMLButtonElement>("#clear-cache-btn")?.addEventListener("click", async () => {
        await store.clear();
        // clear()はメモリキャッシュ・リスナー・resolve状態を全てクリアするため、
        // フィードごと再マウントし直す。
        mountList();
    });

    // 項目は無限フィードによって動的に追加され続けるため、行単位ではなく
    // コンテナへのイベント委譲でクリックを拾う。
    container.addEventListener("click", (event) => {
        const row = (event.target as HTMLElement).closest<HTMLElement>(".user-row");
        const id = row?.dataset.id;
        if (id) {
            location.hash = `#/profile/${encodeURIComponent(id)}`;
        }
    });
}

/* -------------------------------------------------------------------- */
/* 画面3: ランダムタイムライン                                             */
/* -------------------------------------------------------------------- */

const HOT_POOL: string[] = Array.from({ length: HOT_POOL_SIZE }, randomId);

function randomId(): string {
    return formatId(Math.floor(Math.random() * TOTAL_ENTITY_COUNT));
}

function mountTimeline() {
    teardownActiveFeed();

    view.innerHTML = renderTimelineShell();

    const nextIds = (): string[] =>
        Array.from({ length: TIMELINE_BATCH_SIZE }, () =>
            Math.random() < HOT_POOL_RATIO
                ? HOT_POOL[Math.floor(Math.random() * HOT_POOL.length)]
                : randomId()
        );

    const container = view.querySelector<HTMLElement>("#feed-container")!;
    const sentinel = view.querySelector<HTMLElement>("#feed-sentinel")!;

    activeFeed = createFeed({
        container,
        sentinel,
        windowSize: FEED_WINDOW_SIZE,
        nextIds,
        renderItem: renderTimelineCard,
    });

    attachTimelineHandlers(container);
}

function attachTimelineHandlers(container: HTMLElement) {
    container.addEventListener("click", (event) => {
        const card = (event.target as HTMLElement).closest<HTMLElement>(".timeline-card");
        const id = card?.dataset.id;
        if (id) {
            location.hash = `#/profile/${encodeURIComponent(id)}`;
        }
    });
}

/* -------------------------------------------------------------------- */
/* 画面2: プロフィール編集                                                */
/* -------------------------------------------------------------------- */

async function mountProfile(id: string) {
    teardownActiveFeed();

    view.innerHTML = renderProfileView(null, true);
    attachBackHandler();

    try {
        // 一覧・タイムライン(get: キャッシュ優先)とは別の仕組みとして、
        // 常に最新を取りに行く getLatest() を使う。
        const profile = await store.getLatest(id);
        renderProfile(profile);
    } catch (error) {
        view.innerHTML = `
            <button id="back-btn" type="button" class="mb-6 font-mono text-xs text-zinc-500 hover:text-zinc-200">
                ← 一覧に戻る
            </button>
            <p class="rounded-md border border-rose-900 bg-rose-950/50 px-3 py-2 text-sm text-rose-300">
                プロフィールの取得に失敗しました: ${error instanceof Error ? error.message : String(error)}
            </p>
        `;
        attachBackHandler();
    }
}

function renderProfile(profile: EntityProfile) {
    view.innerHTML = renderProfileView(profile, false);
    attachBackHandler();
    attachProfileFormHandler(profile);
    attachDeleteHandler(profile);
    attachIconUploadHandler(profile);
}

function attachBackHandler() {
    document.querySelector<HTMLButtonElement>("#back-btn")?.addEventListener("click", () => {
        location.hash = "#/";
    });
}

function attachProfileFormHandler(profile: EntityProfile) {
    const form = document.querySelector<HTMLFormElement>("#profile-form");
    const message = document.querySelector<HTMLSpanElement>("#save-message");
    const submitBtn = form?.querySelector<HTMLButtonElement>('button[type="submit"]');

    form?.addEventListener("submit", async (event) => {
        event.preventDefault();

        const formData = new FormData(form);
        const rawBio = String(formData.get("bio") ?? "").trim();

        if (submitBtn) submitBtn.disabled = true;
        setMessage(message, "保存中...", "text-zinc-500");

        const result = await patchProfile(profile.id, {
            name: String(formData.get("name") ?? ""),
            bio: rawBio === "" ? null : rawBio,
            version: profile.version,
        });

        if (result.status === "ok") {
            await store.resolve([profile.id]);
            renderProfile(result.profile);
            setMessage(document.querySelector<HTMLSpanElement>("#save-message"), "保存しました", "text-emerald-400");
            return;
        }

        setMessage(message, describePatchError(result), "text-rose-400");
        if (submitBtn) submitBtn.disabled = false;
    });
}

function attachDeleteHandler(profile: EntityProfile) {
    const deleteBtn = document.querySelector<HTMLButtonElement>("#delete-btn");
    const message = document.querySelector<HTMLSpanElement>("#save-message");

    deleteBtn?.addEventListener("click", async () => {
        const confirmed = confirm(
            `「${profile.name || profile.id}」を削除しますか?この操作は取り消せません。`
        );
        if (!confirmed) return;

        deleteBtn.disabled = true;
        setMessage(message, "削除中...", "text-zinc-500");

        const result = await deleteProfile(profile.id);

        if (result.status !== "ok") {
            setMessage(
                message,
                result.status === "not_found"
                    ? "プロフィールが見つかりません"
                    : `削除に失敗しました: ${result.message}`,
                "text-rose-400"
            );
            deleteBtn.disabled = false;
            return;
        }

        // 削除後の最終状態(status: "deleted"含む)をサーバーから取り直して
        // その場に反映する(一覧へは戻さない)。
        await store.resolve([profile.id]);
        const refreshed = await store.getLatest(profile.id);
        renderProfile(refreshed);
        setMessage(
            document.querySelector<HTMLSpanElement>("#save-message"),
            "削除しました",
            "text-emerald-400"
        );
    });
}

function attachIconUploadHandler(profile: EntityProfile) {
    const changeBtn = document.querySelector<HTMLButtonElement>("#change-icon-btn");
    const fileInput = document.querySelector<HTMLInputElement>("#icon-file-input");
    const message = document.querySelector<HTMLParagraphElement>("#icon-message");

    changeBtn?.addEventListener("click", () => {
        fileInput?.click();
    });

    fileInput?.addEventListener("change", async () => {
        const file = fileInput.files?.[0];
        if (!file) return;

        if (changeBtn) changeBtn.disabled = true;
        setMessage(message, "アップロード中...", "text-zinc-500");

        const uploadResult = await uploadIcon(profile.id, file);

        if (!uploadResult.ok) {
            setMessage(
                message,
                `アイコンのアップロードに失敗しました(${uploadResult.message})。もう一度お試しください`,
                "text-rose-400"
            );
            if (changeBtn) changeBtn.disabled = false;
            fileInput.value = "";
            return;
        }

        const result = await patchProfile(profile.id, {
            iconUrl: buildIconUrl(profile.id),
            version: profile.version,
        });

        if (result.status === "ok") {
            await store.resolve([profile.id]);
            renderProfile(result.profile);
            setMessage(
                document.querySelector<HTMLParagraphElement>("#icon-message"),
                "アイコンを更新しました",
                "text-emerald-400"
            );
            return;
        }

        // 画像自体のアップロードは成功しているが、プロフィールへの反映に失敗した状態。
        // 画像サーバー上にファイルは残るが実害はない(再アップロードで上書きされる)。
        setMessage(
            message,
            `画像のアップロードは完了しましたが、プロフィールへの反映に失敗しました(${describePatchError(
                result
            )})。もう一度アイコン変更をお試しください`,
            "text-rose-400"
        );
        if (changeBtn) changeBtn.disabled = false;
        fileInput.value = "";
    });
}

function setMessage(el: Element | null, text: string, colorClass: string) {
    if (!el) return;
    el.textContent = text;
    el.className = `${el.className.split(" ").filter((c) => !c.startsWith("text-")).join(" ")} ${colorClass}`.trim();
}

/* -------------------------------------------------------------------- */
/* ルーティング                                                           */
/* -------------------------------------------------------------------- */

function router() {
    const profileMatch = location.hash.match(/^#\/profile\/(.+)$/);

    if (profileMatch) {
        mountProfile(decodeURIComponent(profileMatch[1]));
        return;
    }

    if (location.hash === "#/timeline") {
        mountTimeline();
        return;
    }

    mountList();
}

window.addEventListener("hashchange", router);
router();