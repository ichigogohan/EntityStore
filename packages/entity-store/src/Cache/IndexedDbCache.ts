import { Dexie, type Table } from "dexie";
import type { CachedProfile } from "../types.js";

interface CachedProfileRecord {
    id: string;
    profile: CachedProfile["profile"];
    lastVerifiedAt: number;
}

export class IndexedDbCache extends Dexie {
    private readonly entities!: Table<CachedProfileRecord, string>;

    constructor() {
        super("entity-store");

        this.version(1).stores({
            entities: "&id",
        });

        this.entities = this.table("entities");
    }

    async load(): Promise<CachedProfile[]> {
        const records = await this.entities.toArray();

        return records.map(({ profile, lastVerifiedAt }) => ({
            profile,
            lastVerifiedAt,
        }));
    }

    async set(value: CachedProfile): Promise<void> {
        await this.entities.put({
            id: value.profile.id,
            profile: value.profile,
            lastVerifiedAt: value.lastVerifiedAt,
        });
    }

    async clearCache(): Promise<void> {
        await this.entities.clear();
    }
}