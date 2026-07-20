import type { EntityProfile } from "./app";

import { EntityStore } from "../../packages/entity-store/dist/index.js";

export const PROFILE_API_URL: string = import.meta.env.VITE_API_URL;

// アイコンアップロード用サーバー(プロフィールAPIとは別サーバー)
export const IMG_API_URL: string = import.meta.env.VITE_IMG_API_URL;

export const store = await EntityStore.create({
    endpoint: PROFILE_API_URL,
});

/* -------------------------------------------------------------------- */
/* PATCH /profiles/:id                                                  */
/* -------------------------------------------------------------------- */

// UpdateProfileRequest (update.ts) に準拠したペイロード。
// metadata は編集項目がないため送信しない。
export interface UpdateProfilePayload {
    name?: string;
    bio?: string | null;
    iconUrl?: string | null;
    version: number;
}

export type PatchProfileResult =
    | { status: "ok"; profile: EntityProfile }
    | { status: "conflict"; currentVersion?: number }
    | { status: "deleted" }
    | { status: "not_found" }
    | { status: "error"; message: string };

export async function patchProfile(
    id: string,
    payload: UpdateProfilePayload
): Promise<PatchProfileResult> {
    try {
        const response = await fetch(`${PROFILE_API_URL}/profiles/${encodeURIComponent(id)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        if (response.status === 409) {
            const conflict = await response.json().catch(() => null);
            return { status: "conflict", currentVersion: conflict?.currentVersion };
        }

        if (response.status === 410) {
            return { status: "deleted" };
        }

        if (response.status === 404) {
            return { status: "not_found" };
        }

        if (!response.ok) {
            return { status: "error", message: `HTTP ${response.status}` };
        }

        // updateProfileRoute は更新後のプロフィールをそのまま返す
        const profile: EntityProfile = await response.json();
        return { status: "ok", profile };
    } catch (error) {
        return {
            status: "error",
            message: error instanceof Error ? error.message : String(error),
        };
    }
}

export function describePatchError(result: Exclude<PatchProfileResult, { status: "ok" }>): string {
    switch (result.status) {
        case "conflict":
            return `バージョンが競合しています(現在のバージョン: ${result.currentVersion ?? "?"})。最新を読み込み直してください`;
        case "deleted":
            return "このプロフィールは削除されています";
        case "not_found":
            return "プロフィールが見つかりません";
        case "error":
            return `保存に失敗しました: ${result.message}`;
    }
}

/* -------------------------------------------------------------------- */
/* POST /upload                                                         */
/* -------------------------------------------------------------------- */

export type UploadIconResult = { ok: true } | { ok: false; message: string };

/**
 * X-User-ID ヘッダーで対象IDを指定し、画像ファイルをアップロードする。
 * 成功時は 204 No Content が返る(レスポンスボディなし)。
 */
export async function uploadIcon(id: string, file: File): Promise<UploadIconResult> {
    const formData = new FormData();
    formData.append("file", file);

    try {
        const response = await fetch(`${IMG_API_URL}/upload`, {
            method: "POST",
            headers: {
                "X-User-ID": id,
            },
            body: formData,
        });

        if (response.status === 204) {
            return { ok: true };
        }

        if (response.status === 400) {
            const body = await response.json().catch(() => null);
            return { ok: false, message: body?.message ?? "画像が不正です" };
        }

        return { ok: false, message: `HTTP ${response.status}` };
    } catch (error) {
        return {
            ok: false,
            message: error instanceof Error ? error.message : String(error),
        };
    }
}

/**
 * アップロード成功後にプロフィール側へ保存する iconUrl を組み立てる。
 * クエリのタイムスタンプはプロフィールサーバー側のDBにそのまま保存され、
 * CDN(Cloudflare)キャッシュを回避する役割を持つ。
 */
export function buildIconUrl(id: string): string {
    return `${IMG_API_URL}/icons/${encodeURIComponent(id)}.webp?=${Date.now()}`;
}
