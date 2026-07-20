import { EntityApi } from "./EntityApi.js";
import { EntityCache } from "./Cache/EntityCache.js";
import { ResolveQueue } from "./ResolveQueue.js";
import type { EntityProfile, EntityStoreOptions, EntityUpdateListener } from "./types.js";

export class EntityStore {
    private readonly api: EntityApi;
    private readonly queue: ResolveQueue;
    private readonly resolving = new Set<string>();
    private readonly listeners = new Map<
        string,
        Set<EntityUpdateListener>
    >();

    private readonly ttl = 1000 * 60 * 5;

    private constructor(
        options: EntityStoreOptions,
        private readonly cache: EntityCache,
    ) {
        this.api = new EntityApi(options.endpoint);

        this.queue = new ResolveQueue(
            ids => this.resolve(ids),
        );
    }

    static async create(
        options: EntityStoreOptions,
    ): Promise<EntityStore> {
        const cache = await EntityCache.create();

        return new EntityStore(options, cache);
    }

    get(id: string): EntityProfile {
        const existing = this.cache.get(id);

        if (existing) {
            const isExpired =
                Date.now() - existing.lastVerifiedAt >= this.ttl;

            if (isExpired && !this.resolving.has(id)) {
                this.resolving.add(id);
                this.queue.enqueue(id);
            }

            return existing.profile;
        }

        const unknown = this.createUnknown(id);

        this.cache.set(id, {
            profile: unknown,
            lastVerifiedAt: Date.now(),
        });

        if (!this.resolving.has(id)) {
            this.resolving.add(id);
            this.queue.enqueue(id);
        }

        return unknown;
    }

    async resolve(ids: string[]): Promise<void> {
        const profiles: Record<string, number> = {};

        for (const id of ids) {
            const cached = this.cache.get(id);
            profiles[id] = cached?.profile.version ?? 0;
        }

        try {
            const response = await this.api.resolve({ profiles });
            const now = Date.now();

            for (const id of ids) {
                const cached = this.cache.get(id);
                const profile = response.profiles[id];

                if (!profile) {
                    // 既存キャッシュのTTLだけ延長する。
                    if (cached) {
                        this.cache.set(id, {
                            profile: cached.profile,
                            lastVerifiedAt: now,
                        });
                    }
                    continue;
                }

                const resolvedProfile =
                    profile.status === "unknown"
                        ? this.createUnknown(id)
                        : profile;

                this.cache.set(id, {
                    profile: resolvedProfile,
                    lastVerifiedAt: now,
                });

                this.emit(resolvedProfile);
            }
        } finally {
            for (const id of ids) {
                this.resolving.delete(id);
            }
        }
    }

    async getLatest(id: string): Promise<EntityProfile> {
        await this.resolve([id]);
        return this.get(id);
    }

    debugCache(): Record<string, unknown> {
        return this.cache.debug();
    }

    async clear(): Promise<void> {
        this.listeners.clear();
        this.resolving.clear();

        await this.cache.clear();
    }

    subscribe(
        id: string,
        listener: EntityUpdateListener,
    ): () => void {
        const listeners = this.listeners.get(id) ?? new Set<EntityUpdateListener>();

        listeners.add(listener);
        this.listeners.set(id, listeners);

        return () => {
            const current = this.listeners.get(id);

            if (!current) {
                return;
            }

            current.delete(listener);

            if (current.size === 0) {
                this.listeners.delete(id);
            }
        };
    }

    private emit(profile: EntityProfile): void {
        const listeners = this.listeners.get(profile.id);

        if (!listeners) {
            return;
        }

        for (const listener of listeners) {
            listener(profile);
        }
    }

    private createUnknown(id: string): EntityProfile {
        return {
            id,
            name: "Unknown-User",
            version: 0,
            status: "unknown",
            iconUrl: "",
            bio: "",
        };
    }
}