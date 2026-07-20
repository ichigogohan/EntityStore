import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify, { FastifyInstance } from "fastify";

// update.ts は profileRepository 経由になったため、prismaではなく profileRepository をモックする。
vi.mock("../src/repositories/profile.repository.js", () => ({
    profileRepository: {
        findById: vi.fn(),
        update: vi.fn(),
    },
}));

import { profileRepository } from "../src/repositories/profile.repository.js";
import { updateProfileRoute } from "../src/routes/profiles/update.js";

// 注: baseProfile.status は「既存プロフィール（DB/キャッシュ上のレコード）」側のフィールドで、
// 削除済みかどうかの判定に実際に使われます。
// リクエストボディ（UpdateProfileRequest）には status は存在しません。
const baseProfile = {
    id: "user-1",
    name: "Old Name",
    bio: "old bio",
    iconUrl: null,
    metadata: null,
    status: "active",
    version: 3,
};

describe("PATCH /profiles/:id (updateProfileRoute)", () => {
    let app: FastifyInstance;

    beforeEach(async () => {
        vi.clearAllMocks();
        app = Fastify();
        await app.register(updateProfileRoute);
        await app.ready();
    });

    it("プロフィールが存在しない場合、404を返す", async () => {
        (profileRepository.findById as any).mockResolvedValue(null);

        const res = await app.inject({
            method: "PATCH",
            url: "/profiles/user-1",
            payload: { name: "New Name", version: 3 },
        });

        expect(res.statusCode).toBe(404);
        expect(res.json()).toEqual({ message: "Profile not found" });
        expect(profileRepository.update).not.toHaveBeenCalled();
    });

    it("プロフィールが削除済み(status: deleted)の場合、410を返す", async () => {
        (profileRepository.findById as any).mockResolvedValue({
            ...baseProfile,
            status: "deleted",
        });

        const res = await app.inject({
            method: "PATCH",
            url: "/profiles/user-1",
            payload: { name: "New Name", version: 3 },
        });

        expect(res.statusCode).toBe(410);
        expect(res.json()).toEqual({ message: "Profile deleted" });
        expect(profileRepository.update).not.toHaveBeenCalled();
    });

    it("削除済みかつversionが不一致でも、410（削除チェック優先）が返る", async () => {
        (profileRepository.findById as any).mockResolvedValue({
            ...baseProfile,
            status: "deleted",
            version: 3,
        });

        const res = await app.inject({
            method: "PATCH",
            url: "/profiles/user-1",
            payload: { name: "New Name", version: 999 },
        });

        expect(res.statusCode).toBe(410);
    });

    it("versionが一致しない場合、409とcurrentVersionを返す", async () => {
        (profileRepository.findById as any).mockResolvedValue(baseProfile); // version: 3

        const res = await app.inject({
            method: "PATCH",
            url: "/profiles/user-1",
            payload: { name: "New Name", version: 2 },
        });

        expect(res.statusCode).toBe(409);
        expect(res.json()).toEqual({
            message: "Version conflict",
            currentVersion: 3,
        });
        expect(profileRepository.update).not.toHaveBeenCalled();
    });

    it("versionが一致する場合、更新して結果を返す（デフォルト200）", async () => {
        (profileRepository.findById as any).mockResolvedValue(baseProfile);
        (profileRepository.update as any).mockResolvedValue({
            ...baseProfile,
            name: "New Name",
            bio: "new bio",
            version: 4,
        });

        const res = await app.inject({
            method: "PATCH",
            url: "/profiles/user-1",
            payload: {
                name: "New Name",
                bio: "new bio",
                iconUrl: "https://example.com/icon.png",
                metadata: { theme: "dark" },
                version: 3,
            },
        });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toMatchObject({ name: "New Name", version: 4 });
    });

    it("profileRepository.update を id と name/bio/iconUrl/metadata のみで呼び出す（versionのincrementはrepository側の責務）", async () => {
        (profileRepository.findById as any).mockResolvedValue(baseProfile);
        (profileRepository.update as any).mockResolvedValue({});

        await app.inject({
            method: "PATCH",
            url: "/profiles/user-1",
            payload: {
                name: "New Name",
                bio: null,
                iconUrl: null,
                metadata: { theme: "dark" },
                version: 3,
            },
        });

        expect(profileRepository.update).toHaveBeenCalledWith("user-1", {
            name: "New Name",
            bio: null,
            iconUrl: null,
            metadata: { theme: "dark" },
        });
    });

    it("リクエストにstatusフィールドを含めても無視される（型に存在しない余分なフィールドの安全性確認）", async () => {
        (profileRepository.findById as any).mockResolvedValue(baseProfile);
        (profileRepository.update as any).mockResolvedValue({});

        await app.inject({
            method: "PATCH",
            url: "/profiles/user-1",
            payload: {
                name: "New Name",
                version: 3,
                status: "unknown",
            } as any,
        });

        const calledData = (profileRepository.update as any).mock.calls[0][1];
        expect(calledData).not.toHaveProperty("status");
    });
});
