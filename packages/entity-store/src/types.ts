export type EntityStatus =
    | "active"
    | "deleted"
    | "unknown";

export type EntityUpdateListener = (profile: EntityProfile) => void;

export interface EntityProfile {
    id: string;

    name: string;

    bio?: string | null;

    iconUrl?: string | null;

    version: number;

    status: EntityStatus;

    metadata?: unknown;
}

export interface CachedProfile {
    profile: EntityProfile;
    lastVerifiedAt: number;
}

export interface EntityStoreOptions {
    endpoint: string;
}

export interface ResolveRequest {
    profiles: Record<string, number>;
}

export interface ResolveResponse {
    profiles: Record<string, EntityProfile>;
}

