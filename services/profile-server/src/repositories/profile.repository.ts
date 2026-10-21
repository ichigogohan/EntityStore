import type { Profile } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { redis } from "../lib/redis.js";
import type { ProfileCreateData, ProfileUpdateData } from "../types/profile.js";

import { isPrismaError, ProfileWriteError } from "./profile.errors.js";

const CACHE_TTL_SECONDS = 60;

export class ProfileRepository {
    private getKey(id: string): string {
        // Ignore old entries that were stored without an expiry.
        return `profile:v2:${id}`;
    }

    private readCached(value: string | null, id: string): Profile | null {
        if (!value) return null;
        try {
            const profile = JSON.parse(value);
            if (
                !profile || profile.id !== id || typeof profile.name !== "string" ||
                !Number.isInteger(profile.version) || profile.version < 1 ||
                !["active", "deleted"].includes(profile.status) ||
                !(profile.bio === null || typeof profile.bio === "string") ||
                !(profile.iconUrl === null || typeof profile.iconUrl === "string") ||
                typeof profile.createdAt !== "string" || typeof profile.updatedAt !== "string" ||
                !Number.isFinite(Date.parse(profile.createdAt)) ||
                !Number.isFinite(Date.parse(profile.updatedAt)) || !("metadata" in profile)
            ) throw new Error("Invalid cached profile");
            return { ...profile, createdAt: new Date(profile.createdAt), updatedAt: new Date(profile.updatedAt) };
        } catch {
            console.warn("Invalid profile cache entry; falling back to PostgreSQL");
            return null;
        }
    }

    private async cache(profile: Profile): Promise<void> {
        try {
            await redis.set(this.getKey(profile.id), JSON.stringify(profile), "EX", CACHE_TTL_SECONDS);
        } catch {
            console.warn("Profile cache write failed; stale entries will expire by TTL");
        }
    }

    async create(profile: ProfileCreateData): Promise<Profile> {
        let created: Profile;
        try {
            created = await prisma.profile.create({ data: { ...profile, status: "active" } });
        } catch (error) {
            if (isPrismaError(error, "P2002")) {
                throw new ProfileWriteError(409, "Profile already exists");
            }
            throw error;
        }
        await this.cache(created);
        return created;
    }

    async findById(id: string): Promise<Profile | null> {
        try {
            const cached = this.readCached(await redis.get(this.getKey(id)), id);
            if (cached) return cached;
        } catch {
            console.warn("Profile cache read failed; falling back to PostgreSQL");
        }
        const profile = await prisma.profile.findUnique({ where: { id } });
        if (profile) await this.cache(profile);
        return profile;
    }

    async findByIds(ids: string[]): Promise<Profile[]> {
        if (ids.length === 0) return [];
        let cachedValues: (string | null)[];
        try {
            cachedValues = await redis.mget(ids.map(id => this.getKey(id)));
        } catch {
            console.warn("Profile cache batch read failed; falling back to PostgreSQL");
            cachedValues = ids.map(() => null);
        }
        const results = new Map<string, Profile>();
        const missingIds: string[] = [];
        ids.forEach((id, index) => {
            const profile = this.readCached(cachedValues[index] ?? null, id);
            if (profile) results.set(id, profile);
            else missingIds.push(id);
        });
        if (missingIds.length > 0) {
            const profiles = await prisma.profile.findMany({ where: { id: { in: missingIds } } });
            // Do not add one timeout per ID during a Redis outage.
            await Promise.all(profiles.map(async profile => {
                results.set(profile.id, profile);
                await this.cache(profile);
            }));
        }
        return Array.from(results.values());
    }

    async update(id: string, expectedVersion: number, data: ProfileUpdateData): Promise<Profile> {
        let updated: Profile;
        try {
            // Prisma's extended unique filter makes the version check part of the UPDATE.
            updated = await prisma.profile.update({
                where: { id, version: expectedVersion, status: "active" },
                data: { ...data, version: { increment: 1 } },
            });
        } catch (error) {
            if (!isPrismaError(error, "P2025")) throw error;
            const current = await prisma.profile.findUnique({ where: { id } });
            if (!current) throw new ProfileWriteError(404, "Profile not found");
            if (current.status === "deleted") throw new ProfileWriteError(410, "Profile deleted");
            throw new ProfileWriteError(409, "Version conflict", current.version);
        }
        await this.cache(updated);
        return updated;
    }

    async delete(id: string): Promise<Profile | null> {
        let deleted: Profile;
        try {
            deleted = await prisma.profile.update({
                where: { id, status: "active" },
                data: { status: "deleted", version: { increment: 1 } },
            });
        } catch (error) {
            if (!isPrismaError(error, "P2025")) throw error;
            const current = await prisma.profile.findUnique({ where: { id } });
            if (!current) throw new ProfileWriteError(404, "Profile not found");
            if (current.status === "deleted") return null;
            throw new ProfileWriteError(409, "Profile is not active", current.version);
        }
        await this.cache(deleted);
        return deleted;
    }
}

export const profileRepository = new ProfileRepository();
