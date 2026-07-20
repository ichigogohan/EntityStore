import { FastifyInstance } from "fastify";
import { profileRepository } from "../../repositories/profile.repository.js";

export async function deleteProfileRoute(
    app: FastifyInstance
) {
    app.delete("/profiles/:id", async (request, reply) => {
        const { id } = request.params as {
            id: string;
        };

        const profile = await profileRepository.findById(id);

        if (!profile) {
            return reply.status(404).send({
                message: "Profile not found",
            });
        }

        if (profile.status === "deleted") {
            return reply.status(204).send();
        }

        const deleted = await profileRepository.delete(id);

        return reply.send(deleted);
    });
}