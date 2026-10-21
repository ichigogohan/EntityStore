import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import { Redis } from "ioredis";
import { prisma } from "../../src/lib/prisma.js";
import { redis } from "../../src/lib/redis.js";
import { profileRepository } from "../../src/repositories/profile.repository.js";
import { createProfileRoute } from "../../src/routes/profiles/create.js";
import { updateProfileRoute } from "../../src/routes/profiles/update.js";
import { deleteProfileRoute } from "../../src/routes/profiles/delete.js";

if (!process.env.DATABASE_URL || !process.env.REDIS_URL) {
    throw new Error("Integration tests require an isolated DATABASE_URL and REDIS_URL");
}
const app = Fastify();
const ids: string[] = [];
const key = (id: string) => `profile:v2:${id}`;
const newId = () => { const id = `integration-${randomUUID()}`; ids.push(id); return id; };
async function waitForRedis(client: Redis) {
    if (client.status === "ready") return;
    await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => { cleanup(); reject(new Error("Redis did not become ready")); }, 5000);
        const ready = () => { cleanup(); resolve(); };
        const cleanup = () => { clearTimeout(timer); client.off("ready", ready); };
        client.once("ready", ready);
    });
}

beforeAll(async () => {
    vi.stubEnv("ENABLE_PROFILE_CREATE", "true");
    await prisma.$connect();
    await waitForRedis(redis);
    await app.register(createProfileRoute);
    await app.register(updateProfileRoute);
    await app.register(deleteProfileRoute);
    await app.ready();
});
afterAll(async () => {
    try {
        await prisma.profile.deleteMany({ where: { id: { in: ids } } });
        if (redis.status === "ready" && ids.length) await redis.del(...ids.map(key));
    } finally {
        await app.close();
        redis.disconnect();
        await prisma.$disconnect();
        vi.unstubAllEnvs();
    }
});

describe("real PostgreSQL and Redis", () => {
    it("allows one concurrent creation and returns 409 for the other", async () => {
        const id = newId();
        const responses = await Promise.all([1, 2].map(() => app.inject({ method: "POST", url: "/profiles", payload: { id } })));
        expect(responses.map(res => res.statusCode).sort()).toEqual([201, 409]);
        expect(await prisma.profile.count({ where: { id } })).toBe(1);
    });

    it("allows one update per expected version even if Redis is stale", async () => {
        const id = newId();
        const created = await profileRepository.create({ id, name: "Initial" });
        const responses = await Promise.all(["Alice", "Bob"].map(name => app.inject({
            method: "PATCH", url: `/profiles/${id}`, payload: { name, version: created.version },
        })));
        expect(responses.map(res => res.statusCode).sort()).toEqual([200, 409]);
        const winner = responses.find(res => res.statusCode === 200)!.json();
        expect(await prisma.profile.findUnique({ where: { id } })).toMatchObject({ version: 2, name: winner.name });
        await redis.set(key(id), JSON.stringify(created), "EX", 60);
        const stale = await app.inject({ method: "PATCH", url: `/profiles/${id}`, payload: { name: "Lost", version: 1 } });
        expect(stale.statusCode).toBe(409);
        expect(stale.json()).toMatchObject({ currentVersion: 2 });
    });

    it("increments version once across simultaneous deletes", async () => {
        const id = newId();
        await profileRepository.create({ id, name: "Initial" });
        const responses = await Promise.all([1, 2].map(() => app.inject({ method: "DELETE", url: `/profiles/${id}` })));
        expect(responses.map(res => res.statusCode).sort()).toEqual([200, 204]);
        expect(await prisma.profile.findUnique({ where: { id } })).toMatchObject({ status: "deleted", version: 2 });
        const update = await app.inject({ method: "PATCH", url: `/profiles/${id}`, payload: { version: 1, name: "No" } });
        expect(update.statusCode).toBe(410);
    });

    it("preserves TTL on hits and refills expired entries from the DB", async () => {
        const id = newId();
        const created = await profileRepository.create({ id, name: "Initial" });
        expect(await redis.ttl(key(id))).toBeGreaterThanOrEqual(58);
        await prisma.profile.update({ where: { id }, data: { name: "Latest", version: { increment: 1 } } });
        await redis.pexpire(key(id), 600);
        expect(await profileRepository.findById(id)).toMatchObject({ name: "Initial" });
        expect(await redis.pttl(key(id))).toBeLessThanOrEqual(600);
        await vi.waitFor(async () => expect(await redis.exists(key(id))).toBe(0), { timeout: 3000 });
        expect(await profileRepository.findById(id)).toMatchObject({ name: "Latest", version: 2 });
        expect(await redis.ttl(key(id))).toBeGreaterThanOrEqual(58);
        // Old non-expiring keys must not affect reads.
        await redis.del(key(id));
        await redis.set(`profile:${id}`, JSON.stringify(created));
        try { expect(await profileRepository.findById(id)).toMatchObject({ name: "Latest" }); }
        finally { await redis.del(`profile:${id}`); }
    });

    it("repairs corrupt cache data", async () => {
        const id = newId();
        await profileRepository.create({ id, name: "Valid" });
        await redis.set(key(id), "broken", "EX", 60);
        expect(await profileRepository.findByIds([id])).toEqual([expect.objectContaining({ name: "Valid" })]);
        expect(JSON.parse((await redis.get(key(id)))!)).toMatchObject({ name: "Valid" });
    });

    it("continues API writes and reads after Redis disconnects, then refills on recovery", async () => {
        const id = newId();
        const observer = new Redis(process.env.REDIS_URL!, { lazyConnect: true });
        await observer.connect();
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        try {
            redis.disconnect();
            const start = Date.now();
            const created = await app.inject({ method: "POST", url: "/profiles", payload: { id } });
            expect(created.statusCode).toBe(201);
            const updated = await app.inject({ method: "PATCH", url: `/profiles/${id}`, payload: { version: 1, name: "Offline update" } });
            expect(updated.statusCode).toBe(200);
            expect(await profileRepository.findById(id)).toMatchObject({ name: "Offline update", version: 2 });
            expect(await profileRepository.findByIds([id])).toEqual([expect.objectContaining({ version: 2 })]);
            expect(Date.now() - start).toBeLessThan(5000);
            expect(await observer.get(key(id))).toBeNull();
            expect(warn).toHaveBeenCalled();
        } finally {
            warn.mockRestore();
            observer.disconnect();
            await redis.connect();
        }
        expect(await profileRepository.findById(id)).toMatchObject({ version: 2 });
        expect(await redis.ttl(key(id))).toBeGreaterThanOrEqual(58);
    });
});
