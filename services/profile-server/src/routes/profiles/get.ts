import { FastifyInstance } from "fastify";
import { prisma } from "../../lib/prisma.js";

export async function getProfileRoute(
    app: FastifyInstance
) {
    app.get("/profiles/:id", async (request, reply) => {
        const { id } = request.params as {
            id: string;
        };

        const profile = await prisma.profile.findUnique({
            where: {
                id,
            },
        });

        if (!profile) {
            return reply.status(404).send({
                message: "Profile not found",
            });
        }

        return profile;
    });
}
