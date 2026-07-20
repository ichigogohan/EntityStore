import { prisma } from "../lib/prisma.js";
import { redis } from "../lib/redis.js";
import { ProfileCreateData, ProfileUpdateData } from "../types/profile.js";

export class ProfileRepository {

    private getKey(id: string) {
        return `profile:${id}`;
    }

    async create(
        profile: ProfileCreateData
    ) {

        const created = await prisma.profile.create({
            data: {
                ...profile,
                status: "active",
            },
        });

        await redis.set(
            this.getKey(created.id),
            JSON.stringify(created)
        );

        return created;
    }

    async findById(id: string) {

        const cached = await redis.get(
            this.getKey(id)
        );

        if (cached) {
            return JSON.parse(cached);
        }

        const profile =
            await prisma.profile.findUnique({
                where: { id },
            });

        if (!profile) {
            return null;
        }

        await redis.set(
            this.getKey(id),
            JSON.stringify(profile)
        );

        return profile;
    }

    async findByIds(ids: string[]) {

        if (ids.length === 0) {
            return [];
        }

        const keys = ids.map(
            id => this.getKey(id)
        );

        const cachedProfiles =
            await redis.mget(keys);

        const results = new Map();

        const missingIds: string[] = [];

        cachedProfiles.forEach(
            (cached, index) => {

                if (!cached) {
                    missingIds.push(ids[index]);
                    return;
                }

                const profile =
                    JSON.parse(cached);

                results.set(
                    profile.id,
                    profile
                );
            }
        );

        if (missingIds.length > 0) {

            const profiles =
                await prisma.profile.findMany({
                    where: {
                        id: {
                            in: missingIds,
                        },
                    },
                });

            for (const profile of profiles) {

                results.set(
                    profile.id,
                    profile
                );

                await redis.set(
                    this.getKey(profile.id),
                    JSON.stringify(profile)
                );
            }
        }

        return Array.from(
            results.values()
        );
    }

    async update(
    id: string,
    data: ProfileUpdateData
    ) {

        const updated =
            await prisma.profile.update({
                where: { id },
                data: {
                    ...data,

                    version: {
                        increment: 1,
                    },
                },
            });

        await redis.set(
            this.getKey(id),
            JSON.stringify(updated)
        );

        return updated;
    }

    async delete(id: string) {

        const deleted =
            await prisma.profile.update({
                where: { id },
                data: {
                    status: "deleted",

                    version: {
                        increment: 1,
                    },
                },
            });

        await redis.set(
            this.getKey(id),
            JSON.stringify(deleted)
        );

        return deleted;
    }
}

export const profileRepository =
    new ProfileRepository();