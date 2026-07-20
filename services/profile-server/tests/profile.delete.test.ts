import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify, { FastifyInstance } from "fastify";

// delete.ts は profileRepository 経由になったため、prismaではなく profileRepository をモックする。
vi.mock("../src/repositories/profile.repository.js", () => ({
    profileRepository: {
        findById: vi.fn(),
        delete: vi.fn(),
    },
}));

import { profileRepository } from "../src/repositories/profile.repository.js";
import { deleteProfileRoute } from "../src/routes/profiles/delete.js";

describe("DELETE /profiles/:id (deleteProfileRoute)", () => {
    let app: FastifyInstance;

    beforeEach(async () => {
        vi.clearAllMocks();
        app = Fastify();
        await app.register(deleteProfileRoute);
        await app.ready();
    });

    it("プロフィールが存在しない場合、404を返す", async () => {
        (profileRepository.findById as any).mockResolvedValue(null);

        const res = await app.inject({
            method: "DELETE",
            url: "/profiles/user-1",
        });

        expect(res.statusCode).toBe(404);
        expect(res.json()).toEqual({ message: "Profile not found" });
        expect(profileRepository.delete).not.toHaveBeenCalled();
    });

    it("既に削除済みの場合、204を返し delete は呼ばれない（冪等性）", async () => {
        (profileRepository.findById as any).mockResolvedValue({
            id: "user-1",
            name: "User",
            status: "deleted",
            version: 5,
        });

        const res = await app.inject({
            method: "DELETE",
            url: "/profiles/user-1",
        });

        expect(res.statusCode).toBe(204);
        expect(profileRepository.delete).not.toHaveBeenCalled();
    });

    it("アクティブなプロフィールを削除すると、profileRepository.delete が呼ばれ結果を返す", async () => {
        (profileRepository.findById as any).mockResolvedValue({
            id: "user-1",
            name: "User",
            status: "active",
            version: 2,
        });
        (profileRepository.delete as any).mockResolvedValue({
            id: "user-1",
            name: "User",
            status: "deleted",
            version: 3,
        });

        const res = await app.inject({
            method: "DELETE",
            url: "/profiles/user-1",
        });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toMatchObject({ status: "deleted", version: 3 });
        expect(profileRepository.delete).toHaveBeenCalledWith("user-1");
    });

    it("profileRepository.findById を id の文字列で呼び出す", async () => {
        (profileRepository.findById as any).mockResolvedValue({
            id: "user-99",
            status: "active",
            version: 0,
        });
        (profileRepository.delete as any).mockResolvedValue({});

        await app.inject({
            method: "DELETE",
            url: "/profiles/user-99",
        });

        expect(profileRepository.findById).toHaveBeenCalledWith("user-99");
    });

    it("status が 'unknown' など active/deleted 以外の場合も通常の削除処理が実行される", async () => {
        (profileRepository.findById as any).mockResolvedValue({
            id: "user-1",
            status: "unknown",
            version: 0,
        });
        (profileRepository.delete as any).mockResolvedValue({
            id: "user-1",
            status: "deleted",
            version: 1,
        });

        const res = await app.inject({
            method: "DELETE",
            url: "/profiles/user-1",
        });

        expect(res.statusCode).toBe(200);
        expect(profileRepository.delete).toHaveBeenCalled();
    });
});
