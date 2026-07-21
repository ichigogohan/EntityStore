/**
 * EntityProfile
 *
 * API_CONTRACT.md の `get` / `resolve` レスポンス、および
 * update.ts の UpdateProfileRequest に準拠したローカル定義。
 * パッケージ側が同名の型をエクスポートしていれば、そちらに差し替えてOKです。
 */
export interface EntityProfile {
    id: string;
    name: string;
    bio?: string | null;
    iconUrl?: string | null;
    version: number;
    status: "active" | "deleted" | "unknown";
    metadata?: unknown;
}

// デモ環境用ID空間: u0000 〜 u4999(一覧・タイムライン共通)
export const TOTAL_ENTITY_COUNT = 5000;

/**
 * アプリ全体の外枠(#view コンテナ + 常設の統計パネル)。
 * main.ts はこの中の #view に各画面を差し込む。
 * 統計パネルは画面遷移をまたいで永続する(一覧・タイムラインが
 * 同じキャッシュ/統計を共有していることを示すため)。
 */
export function renderShell(): string {
    return `
        <div class="min-h-screen bg-zinc-950 text-zinc-100 font-sans">
            <main id="view" class="mx-auto max-w-3xl px-6 py-8 pb-28"></main>
            ${renderStatsPanel()}
        </div>
    `;
}

function renderStatsPanel(): string {
    return `
        <div class="fixed bottom-4 right-4 z-10 w-64 rounded-lg border border-zinc-800 bg-zinc-900/95 px-4 py-3 shadow-lg backdrop-blur">
            <div class="mb-2 flex items-center justify-between">
                <span class="font-mono text-[10px] uppercase tracking-wide text-zinc-500">network stats</span>
                <button id="stats-reset-btn" type="button" class="font-mono text-[10px] text-zinc-600 hover:text-zinc-300">
                    reset
                </button>
            </div>
            <dl class="space-y-1 font-mono text-xs">
                <div class="flex items-center justify-between">
                    <dt class="text-zinc-500">requested</dt>
                    <dd id="stats-requested" class="text-zinc-100">0</dd>
                </div>
                <div class="flex items-center justify-between">
                    <dt class="text-zinc-500">sent to server</dt>
                    <dd id="stats-sent" class="text-zinc-100">0</dd>
                </div>
                <div class="flex items-center justify-between">
                    <dt class="text-zinc-500">version-matched</dt>
                    <dd id="stats-unchanged" class="text-zinc-100">0</dd>
                </div>
                <div class="flex items-center justify-between">
                    <dt class="text-zinc-500">cache hit rate</dt>
                    <dd id="stats-cache-hit-rate" class="text-emerald-400">—</dd>
                </div>
                <div class="flex items-center justify-between border-t border-zinc-800 pt-1 text-zinc-600">
                    <dt>network calls</dt>
                    <dd id="stats-network">0</dd>
                </div>
            </dl>
        </div>
    `;
}

/* -------------------------------------------------------------------- */
/* 画面1: ユーザー一覧                                                    */
/* -------------------------------------------------------------------- */

export function renderListShell(): string {
    return `
        <div class="mb-6 flex items-end justify-between gap-4">
            <div>
                <h2 class="text-xl font-semibold text-zinc-100">プロフィール一覧</h2>
                <p class="mt-1 font-mono text-xs text-zinc-500">
                    <span id="list-loaded-count">0</span> / ${TOTAL_ENTITY_COUNT} entities
                </p>
            </div>

            <div class="flex items-center gap-3">
                <a
                    href="#/timeline"
                    class="font-mono text-xs text-indigo-400 transition-colors hover:text-indigo-300"
                >
                    → ランダムタイムライン
                </a>

                <button
                    id="clear-cache-btn"
                    type="button"
                    class="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 transition-colors hover:border-rose-800 hover:text-rose-300"
                >
                    キャッシュ削除
                </button>
            </div>
        </div>

        <div
            id="feed-container"
            class="divide-y divide-zinc-800 overflow-hidden rounded-lg border border-zinc-800"
        ></div>

        <div id="feed-sentinel" class="h-1"></div>
    `;
}

export function renderListRow(profile: EntityProfile): string {
    const isDeleted = profile.status === "deleted";

    return `
        <button
            type="button"
            data-id="${escapeAttr(profile.id)}"
            class="user-row flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-900 ${
                isDeleted ? "opacity-50" : ""
            }"
        >
            ${renderAvatar(profile, "h-10 w-10 text-sm")}

            <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-medium text-zinc-100">
                    ${escapeHtml(profile.name ?? "")}
                </span>
                <span class="block truncate font-mono text-xs text-zinc-500">${escapeHtml(profile.id)}</span>
            </span>

            ${statusBadge(profile.status)}

            <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4 shrink-0 text-zinc-600">
                <path
                    fill-rule="evenodd"
                    d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                    clip-rule="evenodd"
                />
            </svg>
        </button>
    `;
}

/* -------------------------------------------------------------------- */
/* 画面3: ランダムタイムライン                                             */
/* -------------------------------------------------------------------- */

export function renderTimelineShell(): string {
    return `
        <div class="mb-6 flex items-end justify-between gap-4">
            <div>
                <h2 class="text-xl font-semibold text-zinc-100">ランダムタイムライン</h2>
                <p class="mt-1 font-mono text-xs text-zinc-500">スクロールすると次々読み込まれます</p>
            </div>

            <a href="#/" class="font-mono text-xs text-indigo-400 transition-colors hover:text-indigo-300">
                ← 一覧に戻る
            </a>
        </div>

        <div id="feed-container" class="space-y-3"></div>

        <div id="feed-sentinel" class="h-1"></div>
    `;
}

export function renderTimelineCard(profile: EntityProfile): string {
    const isDeleted = profile.status === "deleted";

    return `
        <button
            type="button"
            data-id="${escapeAttr(profile.id)}"
            class="timeline-card flex w-full items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 text-left transition-colors hover:bg-zinc-900 ${
                isDeleted ? "opacity-50" : ""
            }"
        >
            ${renderAvatar(profile, "h-12 w-12 text-base")}

            <span class="min-w-0 flex-1">
                <span class="flex items-center gap-2">
                    <span class="truncate text-sm font-medium text-zinc-100">
                        ${escapeHtml(profile.name ?? "")}
                    </span>
                    ${statusBadge(profile.status)}
                </span>
                <span class="block truncate font-mono text-xs text-zinc-500">${escapeHtml(profile.id)}</span>
                ${
                    profile.bio
                        ? `<span class="mt-1 block line-clamp-2 text-xs text-zinc-400">${escapeHtml(profile.bio)}</span>`
                        : ""
                }
            </span>
        </button>
    `;
}

/* -------------------------------------------------------------------- */
/* 画面2: プロフィール編集                                                */
/* -------------------------------------------------------------------- */

export function renderProfileView(profile: EntityProfile | null, loading: boolean): string {
    if (loading || !profile) {
        return `
            ${renderBackButton()}
            <div class="animate-pulse space-y-6">
                <div class="flex items-center gap-4">
                    <div class="h-20 w-20 rounded-full bg-zinc-800"></div>
                    <div class="space-y-2">
                        <div class="h-4 w-40 rounded bg-zinc-800"></div>
                        <div class="h-3 w-24 rounded bg-zinc-800"></div>
                    </div>
                </div>
                <div class="h-9 w-full rounded bg-zinc-800"></div>
                <div class="h-24 w-full rounded bg-zinc-800"></div>
            </div>
        `;
    }

    const isDeleted = profile.status === "deleted";

    return `
        ${renderBackButton()}

        <div class="mb-3 flex items-center gap-4">
            <div class="relative shrink-0">
                ${renderAvatar(profile, "h-20 w-20 text-2xl")}

                <button
                    id="change-icon-btn"
                    type="button"
                    ${isDeleted ? "disabled" : ""}
                    aria-label="アイコンを変更"
                    class="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-zinc-300 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <svg viewBox="0 0 20 20" fill="currentColor" class="h-3.5 w-3.5">
                        <path
                            d="M12.146 2.146a.5.5 0 01.708 0l3 3a.5.5 0 010 .708l-8.5 8.5a.5.5 0 01-.233.131l-4 1a.5.5 0 01-.606-.606l1-4a.5.5 0 01.131-.233l8.5-8.5zM11.5 4.207L3 12.707V13.5a.5.5 0 00.5.5h.793l8.5-8.5-1.293-1.293z"
                        />
                    </svg>
                </button>

                <input
                    id="icon-file-input"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    class="hidden"
                    ${isDeleted ? "disabled" : ""}
                />
            </div>

            <div class="min-w-0">
                <h2 class="truncate text-lg font-semibold text-zinc-100">
                    ${escapeHtml(profile.name || "(no name)")}
                </h2>
                <p class="font-mono text-xs text-zinc-500">${escapeHtml(profile.id)}</p>
            </div>

            ${statusBadge(profile.status)}
        </div>

        <p id="icon-message" class="mb-6 min-h-[1em] font-mono text-xs"></p>

        ${
            isDeleted
                ? `<p class="mb-4 rounded-md border border-rose-900 bg-rose-950/50 px-3 py-2 text-xs text-rose-300">
                       このプロフィールは削除済みです。編集内容は保存できません。
                   </p>`
                : ""
        }

        <form id="profile-form" class="space-y-5">
            <div>
                <label class="mb-1.5 block font-mono text-xs uppercase tracking-wide text-zinc-500">
                    名前
                </label>
                <input
                    name="name"
                    type="text"
                    value="${escapeAttr(profile.name ?? "")}"
                    ${isDeleted ? "disabled" : ""}
                    class="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                />
            </div>

            <div>
                <label class="mb-1.5 block font-mono text-xs uppercase tracking-wide text-zinc-500">
                    Bio
                </label>
                <textarea
                    name="bio"
                    rows="4"
                    ${isDeleted ? "disabled" : ""}
                    class="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                >${escapeHtml(profile.bio ?? "")}</textarea>
            </div>

            <div class="flex items-center gap-3 pt-2">
                <button
                    type="submit"
                    ${isDeleted ? "disabled" : ""}
                    class="rounded-md bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    保存
                </button>

                <button
                    id="delete-btn"
                    type="button"
                    ${isDeleted ? "disabled" : ""}
                    class="rounded-md border border-rose-900 px-4 py-2 text-sm font-medium text-rose-300 transition-colors hover:bg-rose-950/50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    削除
                </button>

                <span id="save-message" class="font-mono text-xs"></span>
            </div>
        </form>

        <details class="mt-8 rounded-md border border-zinc-800">
            <summary class="cursor-pointer px-3 py-2 font-mono text-xs text-zinc-500 hover:text-zinc-300">
                debug: raw entity (version ${profile.version})
            </summary>
            <pre class="overflow-x-auto px-3 pb-3 font-mono text-xs text-zinc-500">${escapeHtml(
                JSON.stringify(profile, null, 2)
            )}</pre>
        </details>
    `;
}

function renderBackButton(): string {
    return `
        <button
            id="back-btn"
            type="button"
            class="mb-6 flex items-center gap-1 font-mono text-xs text-zinc-500 transition-colors hover:text-zinc-200"
        >
            <span aria-hidden="true">←</span> 一覧に戻る
        </button>
    `;
}

/* -------------------------------------------------------------------- */
/* 共通パーツ                                                             */
/* -------------------------------------------------------------------- */

// iconUrl が空文字の場合(未解決状態)は public/Unknown.webp を参照する。
function renderAvatar(profile: EntityProfile, sizeClasses: string): string {
    const src = profile.iconUrl || "/Unknown.webp";

    return `
        <img
            src="${escapeAttr(src)}"
            alt=""
            class="${sizeClasses} shrink-0 rounded-full bg-zinc-800 object-cover"
        />
    `;
}

// active / unknown / deleted すべてで常時表示する。
function statusBadge(status: EntityProfile["status"]): string {
    const colorClass =
        status === "active"
            ? "text-emerald-400"
            : status === "deleted"
              ? "text-rose-400"
              : "text-amber-400";

    return `
        <span class="flex shrink-0 items-center gap-1 font-mono text-[10px] uppercase tracking-wide ${colorClass}">
            <span class="h-1.5 w-1.5 rounded-full bg-current"></span>
            ${escapeHtml(status)}
        </span>
    `;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function escapeAttr(value: string): string {
    return escapeHtml(value);
}