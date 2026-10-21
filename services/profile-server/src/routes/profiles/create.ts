import type { FastifyInstance } from "fastify";
import { profileRepository } from "../../repositories/profile.repository.js";
import { ProfileWriteError } from "../../repositories/profile.errors.js";
import type { CreateProfileRequest } from "../../types/profile.js";

export async function createProfileRoute(app: FastifyInstance) {
    app.post<{ Body: CreateProfileRequest }>("/profiles", {
        // Keep the feature gate ahead of validation and database access.
        preValidation: async (_request, reply) => {
            if (process.env.ENABLE_PROFILE_CREATE !== "true") {
                return reply.code(403).send({ message: "Profile creation is disabled." });
            }
        },
        schema: { body: {
            type: "object", required: ["id"],
            properties: { id: { type: "string", minLength: 1 } },
        } },
    }, async (request, reply) => {
        try {
            const profile = await profileRepository.create({ id: request.body.id, name: "New User" });
            return reply.status(201).send(profile);
        } catch (error) {
            if (error instanceof ProfileWriteError) {
                return reply.code(error.statusCode).send({ message: error.message });
            }
            throw error;
        }
    });
}
