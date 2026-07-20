import type { CachedProfile } from "../types.js";
import { IndexedDbCache } from "./IndexedDbCache.js";
import { MemoryCache } from "./MemoryCache.js";

export class EntityCache {
    private writeQueue: Promise<void> = Promise.resolve();

    private constructor(
        private readonly memory: MemoryCache,
        private readonly database: IndexedDbCache,
    ) {}

    static async create(): Promise<EntityCache> {
        const memory = new MemoryCache();
        const database = new IndexedDbCache();

        const storedEntries = await database.load();
        memory.replace(storedEntries);

        return new EntityCache(memory, database);
    }

    get(id: string): CachedProfile | undefined {
        return this.memory.get(id);
    }

    set(id: string, value: CachedProfile): void {
        this.memory.set(id, value);

        this.writeQueue = this.writeQueue
            .catch(() => undefined)
            .then(() => this.database.set(value));
    }

    debug(): Record<string, CachedProfile> {
        return this.memory.toObject();
    }

    async clear(): Promise<void> {
        this.memory.clear();

        await this.writeQueue.catch(() => undefined);
        await this.database.clearCache();

        this.writeQueue = Promise.resolve();
    }
}