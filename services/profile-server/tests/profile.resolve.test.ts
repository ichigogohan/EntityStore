import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify, { FastifyInstance } from "fastify";

// resolve.ts は profileRepository 経由になったため、prismaではなく profileRepository をモックする。
vi.mock("../src/repositories/profile.repository.js", () => ({
    profileRepository: {
        findByIds: vi.fn(),
    },
}));

import { profileRepository } from "../src/repositories/profile.repository.js";
import { resolveProfileRoute } from "../src/routes/profiles/resolve.js";

function dbProfile(overrides: Record<string, any> = {}) {
    return {
        id: "u001",
        name: "Alice",
        bio: "hello",
        iconUrl: "https://example.com/icon.png",
        metadata: { theme: "dark" },
        status: "active",
        version: 5,
        ...overrides,
    };
}

describe("POST /profiles/resolve (resolveProfileRoute)", () => {
    let app: FastifyInstance;

    beforeEach(async () => {
        vi.clearAllMocks();
        app = Fastify();
        await app.register(resolveProfileRoute);
        await app.ready();
    });

    it("profilesが空の場合、空のレスポンスを返し findByIds は呼ばれない", async () => {
        const res = await app.inject({
            method: "POST",
            url: "/profiles/resolve",
            payload: { profiles: {} },
        });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ profiles: {} });
        expect(profileRepository.findByIds).not.toHaveBeenCalled();
    });

    it("最新Version: クライアントのversionがDBと一致する場合、そのidはレスポンスに含まれない", async () => {
        (profileRepository.findByIds as any).mockResolvedValue([
            dbProfile({ id: "u001", version: 5 }),
        ]);

        const res = await app.inject({
            method: "POST",
            url: "/profiles/resolve",
            payload: { profiles: { u001: 5 } },
        });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ profiles: {} });
    });

    it("古いVersion: クライアントのversionがDBより古い場合、status: active で最新情報を返す", async () => {
        (profileRepository.findByIds as any).mockResolvedValue([
            dbProfile({ id: "u001", version: 5 }),
        ]);

        const res = await app.inject({
            method: "POST",
            url: "/profiles/resolve",
            payload: { profiles: { u001: 4 } },
        });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({
            profiles: {
                u001: {
                    id: "u001",
                    name: "Alice",
                    bio: "hello",
                    iconUrl: "https://example.com/icon.png",
                    version: 5,
                    status: "active",
                    metadata: { theme: "dark" },
                },
            },
        });
    });

    it("クライアントVersionがDBより新しい場合でも、一致していなければ同様に解決される（大小比較はせず === のみで判定）", async () => {
        (profileRepository.findByIds as any).mockResolvedValue([
            dbProfile({ id: "u001", version: 5 }),
        ]);

        const res = await app.inject({
            method: "POST",
            url: "/profiles/resolve",
            payload: { profiles: { u001: 999 } },
        });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({
            profiles: {
                u001: {
                    id: "u001",
                    name: "Alice",
                    bio: "hello",
                    iconUrl: "https://example.com/icon.png",
                    version: 5,
                    status: "active",
                    metadata: { theme: "dark" },
                },
            },
        });
    });

    it("Unknown: DBに存在しないIDの場合、status: unknown のみを返す（versionなどは含まない）", async () => {
        (profileRepository.findByIds as any).mockResolvedValue([]); // 該当なし

        const res = await app.inject({
            method: "POST",
            url: "/profiles/resolve",
            payload: { profiles: { "not-found": 1 } },
        });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({
            profiles: {
                "not-found": {
                    id: "not-found",
                    status: "unknown",
                },
            },
        });
    });

    it("Deleted: 削除済みプロフィールの場合、id/version/status(deleted)のみを返す（name等は含まない）", async () => {
        (profileRepository.findByIds as any).mockResolvedValue([
            dbProfile({ id: "u001", status: "deleted", version: 3 }),
        ]);

        const res = await app.inject({
            method: "POST",
            url: "/profiles/resolve",
            payload: { profiles: { u001: 1 } },
        });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({
            profiles: {
                u001: {
                    id: "u001",
                    version: 3,
                    status: "deleted",
                },
            },
        });
    });

    it("削除済みでもクライアントのversionが一致していれば、レスポンスに含まれない", async () => {
        (profileRepository.findByIds as any).mockResolvedValue([
            dbProfile({ id: "u001", status: "deleted", version: 3 }),
        ]);

        const res = await app.inject({
            method: "POST",
            url: "/profiles/resolve",
            payload: { profiles: { u001: 3 } },
        });

        expect(res.json()).toEqual({ profiles: {} });
    });

    it("複数同時Resolve: active/deleted/unknown が混在する結果を返す", async () => {
        (profileRepository.findByIds as any).mockResolvedValue([
            dbProfile({ id: "u001", status: "active", version: 5 }),
            dbProfile({ id: "u002", status: "deleted", version: 9 }),
            // u003 はDB/キャッシュに存在しない
        ]);

        const res = await app.inject({
            method: "POST",
            url: "/profiles/resolve",
            payload: {
                profiles: {
                    u001: 1,
                    u002: 1,
                    u003: 1,
                },
            },
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();

        expect(body.profiles.u001).toMatchObject({
            id: "u001",
            status: "active",
            version: 5,
        });
        expect(body.profiles.u002).toEqual({
            id: "u002",
            status: "deleted",
            version: 9,
        });
        expect(body.profiles.u003).toEqual({
            id: "u003",
            status: "unknown",
        });
    });

    it("複数同時Resolve: 一致しているidだけレスポンスから除外される", async () => {
        (profileRepository.findByIds as any).mockResolvedValue([
            dbProfile({ id: "u001", status: "active", version: 5 }),
            dbProfile({ id: "u002", status: "active", version: 2 }),
        ]);

        const res = await app.inject({
            method: "POST",
            url: "/profiles/resolve",
            payload: {
                profiles: {
                    u001: 5, // 一致 → 除外される
                    u002: 1, // 不一致 → 含まれる
                },
            },
        });

        const body = res.json();
        expect(body.profiles).not.toHaveProperty("u001");
        expect(body.profiles.u002).toMatchObject({ id: "u002", version: 2 });
    });

    it("metadataがnullの場合、レスポンスのJSONにmetadataキー自体が含まれない（undefined変換によるシリアライズ挙動の確認）", async () => {
        (profileRepository.findByIds as any).mockResolvedValue([
            dbProfile({ id: "u001", version: 5, metadata: null }),
        ]);

        const res = await app.inject({
            method: "POST",
            url: "/profiles/resolve",
            payload: { profiles: { u001: 1 } },
        });

        const body = res.json();
        expect(body.profiles.u001).not.toHaveProperty("metadata");
    });

    it("profileRepository.findByIds を要求された全idの配列で呼び出す", async () => {
        (profileRepository.findByIds as any).mockResolvedValue([]);

        await app.inject({
            method: "POST",
            url: "/profiles/resolve",
            payload: { profiles: { u001: 1, u002: 2, u003: 3 } },
        });

        expect(profileRepository.findByIds).toHaveBeenCalledWith([
            "u001",
            "u002",
            "u003",
        ]);
    });
});
