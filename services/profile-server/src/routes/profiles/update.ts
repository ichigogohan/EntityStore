import { FastifyInstance } from "fastify";
import { profileRepository } from "../../repositories/profile.repository.js";
import { UpdateProfileRequest, ProfileParams } from "../../types/profile.js";

export async function updateProfileRoute(
    app: FastifyInstance
) {
    app.patch<{
        Params: ProfileParams; 
        Body: UpdateProfileRequest;
    }>("/profiles/:id", async (request, reply) => {
        const { id } = request.params;
        const body = request.body;

        const profile = await profileRepository.findById(id);

        if (!profile) {
            return reply.status(404).send({
                message: "Profile not found",
            });
        }
        
        if(profile.status === "deleted"){
            return reply.status(410).send({
                message: "Profile deleted"
            });
        }

        if (profile.version !== body.version) {
            return reply.status(409).send({
                message: "Version conflict",
                currentVersion: profile.version,
            });
        }

        const updated = await profileRepository.update(
            id,
            {
                name: body.name,
                bio: body.bio,
                iconUrl: body.iconUrl,
                metadata: body.metadata,
            }
        );

        return updated;
    });
}