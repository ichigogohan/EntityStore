import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
vi.mock("../src/repositories/profile.repository.js", () => ({ profileRepository: { create: vi.fn() } }));
import { profileRepository } from "../src/repositories/profile.repository.js";
import { ProfileWriteError } from "../src/repositories/profile.errors.js";
import { createProfileRoute } from "../src/routes/profiles/create.js";

let app: FastifyInstance;
beforeEach(async () => {
    vi.resetAllMocks();
    vi.stubEnv("ENABLE_PROFILE_CREATE", "true");
    app = Fastify();
    await app.register(createProfileRoute);
});
afterEach(async () => { await app.close(); vi.unstubAllEnvs(); });

describe("POST /profiles", () => {
    it("creates with the fixed initial name and ignores extra fields", async () => {
        vi.mocked(profileRepository.create).mockResolvedValue({ id: "u1", name: "New User" } as any);
        const res = await app.inject({ method: "POST", url: "/profiles", payload: { id: "u1", name: "Ignored" } });
        expect(res.statusCode).toBe(201);
        expect(res.json()).toEqual({ id: "u1", name: "New User" });
        expect(profileRepository.create).toHaveBeenCalledWith({ id: "u1", name: "New User" });
    });
    it("maps a duplicate ID to 409", async () => {
        vi.mocked(profileRepository.create).mockRejectedValue(new ProfileWriteError(409, "Profile already exists"));
        const res = await app.inject({ method: "POST", url: "/profiles", payload: { id: "u1" } });
        expect(res.statusCode).toBe(409);
        expect(res.json()).toEqual({ message: "Profile already exists" });
    });
    it.each(["false", "", "TRUE"])("disables creation when the flag is %s", async flag => {
        vi.stubEnv("ENABLE_PROFILE_CREATE", flag);
        const res = await app.inject({ method: "POST", url: "/profiles", payload: {} });
        expect(res.statusCode).toBe(403);
        expect(profileRepository.create).not.toHaveBeenCalled();
    });
    it.each([{}, { id: "" }, { id: null }])("rejects invalid IDs: %j", async payload => {
        const res = await app.inject({ method: "POST", url: "/profiles", payload });
        expect(res.statusCode).toBe(400);
        expect(profileRepository.create).not.toHaveBeenCalled();
    });
    it("does not hide a database outage", async () => {
        vi.mocked(profileRepository.create).mockRejectedValue(new Error("DB unavailable"));
        const res = await app.inject({ method: "POST", url: "/profiles", payload: { id: "u1" } });
        expect(res.statusCode).toBe(500);
    });
});
