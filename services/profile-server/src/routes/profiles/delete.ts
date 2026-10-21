import type { FastifyInstance } from "fastify";
import { profileRepository } from "../../repositories/profile.repository.js";
import { ProfileWriteError } from "../../repositories/profile.errors.js";
import type { ProfileParams } from "../../types/profile.js";

export async function deleteProfileRoute(app: FastifyInstance) {
    app.delete<{ Params: ProfileParams }>("/profiles/:id", async (request, reply) => {
        try {
            const deleted = await profileRepository.delete(request.params.id);
            return deleted ? reply.send(deleted) : reply.code(204).send();
        } catch (error) {
            if (error instanceof ProfileWriteError) {
                return reply.code(error.statusCode).send({ message: error.message });
            }
            throw error;
        }
    });
}
