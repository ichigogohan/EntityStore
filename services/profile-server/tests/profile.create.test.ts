import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify, { FastifyInstance } from "fastify";

// create.ts は profileRepository (src/repositories/profile.repository.ts) 経由になったため、
// prismaではなく profileRepository をモックする。
vi.mock("../src/repositories/profile.repository.js", () => ({
    profileRepository: {
        findById: vi.fn(),
        create: vi.fn(),
    },
}));

import { profileRepository } from "../src/repositories/profile.repository.js";
import { createProfileRoute } from "../src/routes/profiles/create.js";

describe("POST /profiles (createProfileRoute)", () => {
    let app: FastifyInstance;

    beforeEach(async () => {
        vi.clearAllMocks();
        app = Fastify();
        await app.register(createProfileRoute);
        await app.ready();
    });

    it("既存プロフィールが存在しない場合、201でプロフィールを新規作成する", async () => {
        (profileRepository.findById as any).mockResolvedValue(null);
        (profileRepository.create as any).mockResolvedValue({
            id: "user-1",
            name: "New User",
            status: "active",
            version: 0,
        });

        const res = await app.inject({
            method: "POST",
            url: "/profiles",
            payload: { id: "user-1" },
        });

        expect(res.statusCode).toBe(201);
        expect(res.json()).toEqual({
            id: "user-1",
            name: "New User",
            status: "active",
            version: 0,
        });
    });

    it("profileRepository.create を id/name の固定値で呼び出す（statusはrepository側の責務）", async () => {
        (profileRepository.findById as any).mockResolvedValue(null);
        (profileRepository.create as any).mockResolvedValue({});

        await app.inject({
            method: "POST",
            url: "/profiles",
            payload: { id: "user-1" },
        });

        expect(profileRepository.create).toHaveBeenCalledWith({
            id: "user-1",
            name: "New User",
        });
    });

    it("profileRepository.findById を id の文字列で呼び出す", async () => {
        (profileRepository.findById as any).mockResolvedValue(null);
        (profileRepository.create as any).mockResolvedValue({});

        await app.inject({
            method: "POST",
            url: "/profiles",
            payload: { id: "user-42" },
        });

        expect(profileRepository.findById).toHaveBeenCalledWith("user-42");
    });

    it("既に同じidのプロフィールが存在する場合、409を返し create は呼ばれない", async () => {
        (profileRepository.findById as any).mockResolvedValue({
            id: "user-1",
            name: "Existing",
            status: "active",
            version: 0,
        });

        const res = await app.inject({
            method: "POST",
            url: "/profiles",
            payload: { id: "user-1" },
        });

        expect(res.statusCode).toBe(409);
        expect(res.json()).toEqual({ message: "Profile already exists" });
        expect(profileRepository.create).not.toHaveBeenCalled();
    });

    it("リクエストで別のnameを送っても無視され、常に'New User'で作成される（現在の仕様の確認）", async () => {
        (profileRepository.findById as any).mockResolvedValue(null);
        (profileRepository.create as any).mockResolvedValue({});

        await app.inject({
            method: "POST",
            url: "/profiles",
            payload: { id: "user-1", name: "Ignored Name" } as any,
        });

        expect(profileRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({ name: "New User" })
        );
    });
});
