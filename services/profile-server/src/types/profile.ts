import { Prisma } from "@prisma/client";

export interface CreateProfileRequest {
    id: string;
}

export interface ProfileParams {
    id: string;
}

export interface UpdateProfileRequest {
    name?: string;
    bio?: string | null;
    iconUrl?: string | null;
    metadata?: Prisma.InputJsonValue;
    version: number;
}

export interface ResolveRequest {
    profiles: Record<string, number>;
}

export interface ResolveProfile {
    id: string;

    status:
        | "active"
        | "deleted"
        | "unknown";

    name?: string;
    bio?: string | null;
    iconUrl?: string | null;
    version?: number;
    metadata?: Prisma.InputJsonValue;
}

export interface ResolveResponse {
    profiles: Record<string, ResolveProfile>;
}


export interface ProfileCreateData {
    id: string;
    name: string;
    bio?: string | null;
    iconUrl?: string | null;
    metadata?: Prisma.InputJsonValue;
}

export interface ProfileUpdateData {
    name?: string;
    bio?: string | null;
    iconUrl?: string | null;
    metadata?: Prisma.InputJsonValue;
}

export const PROFILE_LIMITS = {
    NAME_MAX_LENGTH: 64,
    BIO_MAX_LENGTH: 512,
    ICON_URL_MAX_LENGTH: 512,
} as const;