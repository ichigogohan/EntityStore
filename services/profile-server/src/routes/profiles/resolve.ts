import { FastifyInstance } from "fastify";
import { profileRepository } from "../../repositories/profile.repository.js";
import { ResolveRequest, ResolveResponse, ResolveProfile,} from "../../types/profile.js";

export async function resolveProfileRoute(
    app: FastifyInstance
) {
    app.post<{
        Body: ResolveRequest;
    }>("/profiles/resolve", async (request, reply) => {

            const body = request.body;

            const response: ResolveResponse = {
                profiles: {},
            };

            const ids = Object.keys(body.profiles);

            if (ids.length === 0) {
                return response;
            }

            const profiles = await profileRepository.findByIds(ids);

            const profileMap = new Map(
                profiles.map(profile => [
                    profile.id,
                    profile,
                ])
            );

            for (const id of ids) {

                const clientVersion =
                    body.profiles[id];

                const profile =
                    profileMap.get(id);

                if (!profile) {

                    response.profiles[id] = {
                        id,
                        status: "unknown",
                    };

                    continue;
                }

                if (
                    clientVersion ===
                    profile.version
                ) {
                    continue;
                }

                if (
                    profile.status ===
                    "deleted"
                ) {
                    response.profiles[id] = {
                        id: profile.id,
                        version: profile.version,
                        status: "deleted",
                    };

                    continue;
                }

                const resolved: ResolveProfile = {
                    id: profile.id,

                    name: profile.name,

                    bio: profile.bio,

                    iconUrl: profile.iconUrl,

                    version: profile.version,

                    status: "active",

                    metadata:
                        profile.metadata ?? undefined,
                };

                response.profiles[id] =
                    resolved;
            }

            return reply.send(response);
        }
    );
}