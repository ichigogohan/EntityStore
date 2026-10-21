import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/prisma.js", () => ({ prisma: { profile: {
    findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(),
} } }));
vi.mock("../src/lib/redis.js", () => ({ redis: {
    get: vi.fn(), mget: vi.fn(), set: vi.fn(),
} }));

import { prisma } from "../src/lib/prisma.js";
import { redis } from "../src/lib/redis.js";
import { ProfileRepository } from "../src/repositories/profile.repository.js";

const profile = {
    id: "user-1", name: "Alice", version: 2, status: "active",
    bio: null, iconUrl: null, metadata: null,
    createdAt: new Date("2026-01-01T00:00:00Z"), updatedAt: new Date("2026-01-02T00:00:00Z"),
};
const db = vi.mocked(prisma.profile);
const cache = vi.mocked(redis);
let repository: ProfileRepository;

beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    cache.get.mockResolvedValue(null);
    cache.mget.mockResolvedValue([null]);
    cache.set.mockResolvedValue("OK");
    db.findUnique.mockResolvedValue(profile);
    db.findMany.mockResolvedValue([profile]);
    db.create.mockResolvedValue(profile);
    db.update.mockResolvedValue(profile);
    repository = new ProfileRepository();
});
afterEach(() => vi.restoreAllMocks());

describe("profile cache", () => {
    it("serves a hit without DB access or TTL refresh, restoring date types", async () => {
        cache.get.mockResolvedValue(JSON.stringify(profile));
        expect(await repository.findById(profile.id)).toEqual(profile);
        expect(cache.get).toHaveBeenCalledWith("profile:v2:user-1");
        expect(db.findUnique).not.toHaveBeenCalled();
        expect(cache.set).not.toHaveBeenCalled();
    });

    it("repopulates missing/expired entries with a 60-second TTL", async () => {
        expect(await repository.findById(profile.id)).toEqual(profile);
        expect(cache.set).toHaveBeenCalledWith("profile:v2:user-1", JSON.stringify(profile), "EX", 60);
    });

    it.each(["not json", "null", "{}", JSON.stringify({ ...profile, id: "other" }),
        JSON.stringify({ ...profile, version: "2" }), JSON.stringify({ ...profile, createdAt: "invalid" }),
    ])("falls back for invalid cached data: %s", async value => {
        cache.get.mockResolvedValue(value);
        expect(await repository.findById(profile.id)).toEqual(profile);
        expect(db.findUnique).toHaveBeenCalledWith({ where: { id: profile.id } });
    });

    it("does not cache unknown IDs", async () => {
        db.findUnique.mockResolvedValue(null);
        expect(await repository.findById("missing")).toBeNull();
        expect(cache.set).not.toHaveBeenCalled();
    });

    it("returns DB data when both Redis read and write fail", async () => {
        cache.get.mockRejectedValue(new Error("offline"));
        cache.set.mockRejectedValue(new Error("offline"));
        expect(await repository.findById(profile.id)).toEqual(profile);
        expect(console.warn).toHaveBeenCalled();
    });

    it("only fetches missing or corrupt batch entries from DB", async () => {
        cache.mget.mockResolvedValue([JSON.stringify(profile), "broken", null]);
        const second = { ...profile, id: "user-2" };
        db.findMany.mockResolvedValue([second]);
        expect(await repository.findByIds([profile.id, second.id, "missing"])).toEqual([profile, second]);
        expect(db.findMany).toHaveBeenCalledWith({ where: { id: { in: [second.id, "missing"] } } });
        expect(cache.set).toHaveBeenCalledTimes(1);
    });

    it("falls back for a Redis batch outage", async () => {
        cache.mget.mockRejectedValue(new Error("offline"));
        cache.set.mockRejectedValue(new Error("offline"));
        expect(await repository.findByIds([profile.id])).toEqual([profile]);
    });

    it("does not access either store for an empty batch", async () => {
        expect(await repository.findByIds([])).toEqual([]);
        expect(cache.mget).not.toHaveBeenCalled();
        expect(db.findMany).not.toHaveBeenCalled();
    });

    it.each(["create", "update", "delete"] as const)("keeps a successful DB %s when Redis fails", async operation => {
        cache.set.mockRejectedValue(new Error("offline"));
        const result = operation === "create" ? await repository.create({ id: profile.id, name: profile.name })
            : operation === "update" ? await repository.update(profile.id, profile.version, { name: "New" })
            : await repository.delete(profile.id);
        expect(result).toEqual(profile);
        expect(cache.set).toHaveBeenCalledWith("profile:v2:user-1", JSON.stringify(profile), "EX", 60);
    });

    it("never writes Redis when the DB write fails", async () => {
        db.create.mockRejectedValue(new Error("DB unavailable"));
        await expect(repository.create({ id: profile.id, name: profile.name })).rejects.toThrow("DB unavailable");
        expect(cache.set).not.toHaveBeenCalled();
    });
});

describe("authoritative DB writes", () => {
    it("checks version and active status in the UPDATE itself", async () => {
        await repository.update(profile.id, 2, { name: "New" });
        expect(db.update).toHaveBeenCalledWith({
            where: { id: profile.id, version: 2, status: "active" },
            data: { name: "New", version: { increment: 1 } },
        });
        expect(cache.get).not.toHaveBeenCalled();
    });

    it.each([
        [null, 404, "Profile not found"],
        [{ ...profile, status: "deleted" }, 410, "Profile deleted"],
        [{ ...profile, version: 3 }, 409, "Version conflict"],
    ])("classifies conditional update failure using the DB", async (current, statusCode, message) => {
        const { Prisma } = await import("@prisma/client");
        db.update.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("not found", { code: "P2025", clientVersion: "6" }));
        db.findUnique.mockResolvedValue(current as any);
        await expect(repository.update(profile.id, 2, {})).rejects.toMatchObject({ statusCode, message });
        expect(cache.get).not.toHaveBeenCalled();
        expect(cache.set).not.toHaveBeenCalled();
    });

    it("maps a concurrent create constraint violation to 409", async () => {
        const { Prisma } = await import("@prisma/client");
        db.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "6" }));
        await expect(repository.create({ id: profile.id, name: "New" })).rejects.toMatchObject({ statusCode: 409 });
        expect(cache.set).not.toHaveBeenCalled();
    });

    it("uses active status as an atomic deletion condition", async () => {
        await repository.delete(profile.id);
        expect(db.update).toHaveBeenCalledWith({
            where: { id: profile.id, status: "active" },
            data: { status: "deleted", version: { increment: 1 } },
        });
    });

    it("does not increment version again for an already deleted record", async () => {
        const { Prisma } = await import("@prisma/client");
        db.update.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("not found", { code: "P2025", clientVersion: "6" }));
        db.findUnique.mockResolvedValue({ ...profile, status: "deleted" });
        expect(await repository.delete(profile.id)).toBeNull();
        expect(db.update).toHaveBeenCalledTimes(1);
        expect(cache.set).not.toHaveBeenCalled();
    });
});
