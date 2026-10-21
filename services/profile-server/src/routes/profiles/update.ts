import type { FastifyInstance } from "fastify";
import { profileRepository } from "../../repositories/profile.repository.js";
import { ProfileWriteError } from "../../repositories/profile.errors.js";
import { PROFILE_LIMITS, type UpdateProfileRequest, type ProfileParams } from "../../types/profile.js";

export async function updateProfileRoute(app: FastifyInstance) {
    app.patch<{ Params: ProfileParams; Body: UpdateProfileRequest }>("/profiles/:id", {
        schema: { body: {
            type: "object", required: ["version"],
            properties: {
                version: { type: "integer", minimum: 1, maximum: 2147483647 },
                name: { type: "string", maxLength: PROFILE_LIMITS.NAME_MAX_LENGTH },
                bio: { type: ["string", "null"], maxLength: PROFILE_LIMITS.BIO_MAX_LENGTH },
                iconUrl: { type: ["string", "null"], maxLength: PROFILE_LIMITS.ICON_URL_MAX_LENGTH },
            },
        } },
    }, async (request, reply) => {
        const { id } = request.params;
        const body = request.body;
        try {
            return await profileRepository.update(id, body.version, {
                name: body.name, bio: body.bio, iconUrl: body.iconUrl, metadata: body.metadata,
            });
        } catch (error) {
            if (error instanceof ProfileWriteError) {
                return reply.code(error.statusCode).send({
                    message: error.message,
                    ...(error.currentVersion === undefined ? {} : { currentVersion: error.currentVersion }),
                });
            }
            throw error;
        }
    });
}
