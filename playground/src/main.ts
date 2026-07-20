import "./style.css";

import { renderShell, renderListView, renderProfileView } from "./app";
import type { EntityProfile } from "./app";

import { store, patchProfile, describePatchError, uploadIcon, buildIconUrl } from "./api";

const root = document.querySelector<HTMLDivElement>("#app")!;
root.innerHTML = renderShell();

const view = document.querySelector<HTMLElement>("#view")!;

/* -------------------------------------------------------------------- */
/* 画面1: ユーザー一覧                                                    */
/* -------------------------------------------------------------------- */

// デモ環境用ID: u0000 〜 u0049
const DEMO_IDS: string[] = Array.from(
    { length: 51 },
    (_, i) => `u${String(i).padStart(4, "0")}`
);

let listUnsubscribes: Array<() => void> = [];

function teardownList() {
    listUnsubscribes.forEach((unsubscribe) => unsubscribe());
    listUnsubscribes = [];
}

function mountList() {
    teardownList();

    const profiles = new Map<string, EntityProfile>();

    let rerenderScheduled = false;

    const rerender = () => {
        if (rerenderScheduled) return;
        rerenderScheduled = true;

        requestAnimationFrame(() => {
            rerenderScheduled = false;

            const ordered = DEMO_IDS.map((id) => profiles.get(id)!);

            view.innerHTML = renderListView(ordered);
            attachListHandlers();
        });
    };

    // store.get() は内部で 10ms 毎にキューをまとめて一括解決するため、
    // ループでそのまま呼んでよい(手動バッチ処理は不要)。
    DEMO_IDS.forEach((id) => {
        profiles.set(id, store.get(id));

        const unsubscribe = store.subscribe(id, (updated: EntityProfile) => {
            profiles.set(id, updated);
            rerender();
        });

        listUnsubscribes.push(unsubscribe);
    });

    rerender();
}

function attachListHandlers() {
    document.querySelector<HTMLButtonElement>("#clear-cache-btn")?.addEventListener("click", async () => {
        await store.clear();
        // clear()はメモリキャッシュ・リスナー・resolve状態を全てクリアするため、
        // 購読も含めて一覧を再マウントし直す。
        mountList();
    });

    document.querySelectorAll<HTMLButtonElement>(".user-row").forEach((row) => {
        row.addEventListener("click", () => {
            const id = row.dataset.id;
            if (id) {
                location.hash = `#/profile/${encodeURIComponent(id)}`;
            }
        });
    });
}

/* -------------------------------------------------------------------- */
/* 画面2: プロフィール編集                                                */
/* -------------------------------------------------------------------- */

async function mountProfile(id: string) {
    teardownList();

    view.innerHTML = renderProfileView(null, true);
    attachBackHandler();

    try {
        // 一覧(get: キャッシュ優先)とは別の仕組みとして、
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
    const match = location.hash.match(/^#\/profile\/(.+)$/);

    if (match) {
        mountProfile(decodeURIComponent(match[1]));
    } else {
        mountList();
    }
}

window.addEventListener("hashchange", router);
router();
