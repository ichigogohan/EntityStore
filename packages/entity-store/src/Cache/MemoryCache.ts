import type { CachedProfile } from "../types.js";

export class MemoryCache {
    private readonly cache = new Map<string, CachedProfile>();

    get(id: string): CachedProfile | undefined {
        return this.cache.get(id);
    }

    set(id: string, value: CachedProfile): void {
        this.cache.set(id, value);
    }

    replace(entries: CachedProfile[]): void {
        this.cache.clear();

        for (const entry of entries) {
            this.cache.set(entry.profile.id, entry);
        }
    }

    clear(): void {
        this.cache.clear();
    }

    toObject(): Record<string, CachedProfile> {
        return Object.fromEntries(this.cache.entries());
    }
}