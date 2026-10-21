import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
vi.mock("../src/repositories/profile.repository.js", () => ({ profileRepository: { update: vi.fn() } }));
import { profileRepository } from "../src/repositories/profile.repository.js";
import { ProfileWriteError } from "../src/repositories/profile.errors.js";
import { updateProfileRoute } from "../src/routes/profiles/update.js";
let app: FastifyInstance;
beforeEach(async () => { vi.resetAllMocks(); app = Fastify(); await app.register(updateProfileRoute); });
afterEach(async () => { await app.close(); });

describe("PATCH /profiles/:id", () => {
    it("passes the expected version separately and ignores status", async () => {
        vi.mocked(profileRepository.update).mockResolvedValue({ id: "u1", name: "Alice", version: 4 } as any);
        const res = await app.inject({ method: "PATCH", url: "/profiles/u1", payload: {
            version: 3, name: "Alice", bio: null, iconUrl: null, metadata: { a: 1 }, status: "deleted",
        } });
        expect(res.statusCode).toBe(200);
        expect(res.json()).toMatchObject({ name: "Alice", version: 4 });
        expect(profileRepository.update).toHaveBeenCalledWith("u1", 3, {
            name: "Alice", bio: null, iconUrl: null, metadata: { a: 1 },
        });
    });
    it.each([
        [404, "Profile not found", undefined], [410, "Profile deleted", undefined], [409, "Version conflict", 4],
    ] as const)("preserves the %i response", async (code, message, currentVersion) => {
        vi.mocked(profileRepository.update).mockRejectedValue(new ProfileWriteError(code, message, currentVersion));
        const res = await app.inject({ method: "PATCH", url: "/profiles/u1", payload: { version: 3 } });
        expect(res.statusCode).toBe(code);
        expect(res.json()).toEqual({ message, ...(currentVersion ? { currentVersion } : {}) });
    });
    it.each([{}, { version: 0 }, { version: -1 }, { version: 1.5 }, { version: null },
        { version: 2147483648 }, { version: 1, name: "x".repeat(65) },
        { version: 1, bio: "x".repeat(513) }, { version: 1, iconUrl: "x".repeat(513) },
    ])("rejects invalid updates before DB access: %j", async payload => {
        const res = await app.inject({ method: "PATCH", url: "/profiles/u1", payload });
        expect(res.statusCode).toBe(400);
        expect(profileRepository.update).not.toHaveBeenCalled();
    });
});
