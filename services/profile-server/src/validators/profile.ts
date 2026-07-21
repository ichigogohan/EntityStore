import { PROFILE_LIMITS } from "../types/profile.js";

export function validateProfileFields(
    fields: {
        name?: string;
        bio?: string | null;
        iconUrl?: string | null;
    }
): string | null {

    if (
        fields.name !== undefined &&
        fields.name.length >
            PROFILE_LIMITS.NAME_MAX_LENGTH
    ) {
        return `name must be ${PROFILE_LIMITS.NAME_MAX_LENGTH} characters or less`;
    }

    if (
        fields.bio !== undefined &&
        fields.bio !== null &&
        fields.bio.length >
            PROFILE_LIMITS.BIO_MAX_LENGTH
    ) {
        return `bio must be ${PROFILE_LIMITS.BIO_MAX_LENGTH} characters or less`;
    }

    if (
        fields.iconUrl !== undefined &&
        fields.iconUrl !== null &&
        fields.iconUrl.length >
            PROFILE_LIMITS.ICON_URL_MAX_LENGTH
    ) {
        return `iconUrl must be ${PROFILE_LIMITS.ICON_URL_MAX_LENGTH} characters or less`;
    }

    return null;
}