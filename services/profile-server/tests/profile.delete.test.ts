import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
vi.mock("../src/repositories/profile.repository.js", () => ({ profileRepository: { delete: vi.fn() } }));
import { profileRepository } from "../src/repositories/profile.repository.js";
import { ProfileWriteError } from "../src/repositories/profile.errors.js";
import { deleteProfileRoute } from "../src/routes/profiles/delete.js";
let app: FastifyInstance;
beforeEach(async () => { vi.resetAllMocks(); app = Fastify(); await app.register(deleteProfileRoute); });
afterEach(async () => { await app.close(); });

describe("DELETE /profiles/:id", () => {
    it("returns the deleted profile", async () => {
        vi.mocked(profileRepository.delete).mockResolvedValue({ id: "u1", status: "deleted", version: 2 } as any);
        const res = await app.inject({ method: "DELETE", url: "/profiles/u1" });
        expect(res.statusCode).toBe(200);
        expect(res.json()).toMatchObject({ status: "deleted", version: 2 });
        expect(profileRepository.delete).toHaveBeenCalledWith("u1");
    });
    it("returns 204 for an already deleted profile", async () => {
        vi.mocked(profileRepository.delete).mockResolvedValue(null);
        const res = await app.inject({ method: "DELETE", url: "/profiles/u1" });
        expect(res.statusCode).toBe(204);
        expect(res.body).toBe("");
    });
    it("returns 404 for an unknown ID", async () => {
        vi.mocked(profileRepository.delete).mockRejectedValue(new ProfileWriteError(404, "Profile not found"));
        const res = await app.inject({ method: "DELETE", url: "/profiles/u1" });
        expect(res.statusCode).toBe(404);
        expect(res.json()).toEqual({ message: "Profile not found" });
    });
});
