import { FastifyInstance } from "fastify";
import { profileRepository } from "../../repositories/profile.repository.js";
import { CreateProfileRequest } from "../../types/profile.js";

export async function createProfileRoute(
    app: FastifyInstance
) {
    app.post<{
        Body: CreateProfileRequest;
    }>("/profiles", async (request, reply) => {
        if (process.env.ENABLE_PROFILE_CREATE !== "true") {
            return reply.code(403).send({
                message:
                    "Profile creation is disabled."
            });
        }

        const body = request.body;

        const existing = await profileRepository.findById(body.id);

        if (existing) {
            return reply.status(409).send({
                message: "Profile already exists",
            });
        }

        const profile = await profileRepository.create({
            id: body.id,
            name: "New User",
        });

        return reply.status(201).send(profile);
    });
}