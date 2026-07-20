import 'dotenv/config'

import Fastify from 'fastify'
import cors from "@fastify/cors";

import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";



import { prisma } from './lib/prisma.js'
import { redis } from './lib/redis.js'

import { createProfileRoute } from "./routes/profiles/create.js";
import { updateProfileRoute } from "./routes/profiles/update.js";
import { deleteProfileRoute } from "./routes/profiles/delete.js";
import { resolveProfileRoute } from "./routes/profiles/resolve.js";
import { getProfileRoute } from "./routes/profiles/get.js";
import { allowedOrigins } from "./config/cors.js";


const app = Fastify({
    logger: true,
})

await app.register(swagger, {
    openapi: {
        info: {
            title: "EntityStore API",
            version: "1.0.0"
        }
    }
});

await app.register(swaggerUi, {
    routePrefix: "/docs"
});

await app.register(cors, {
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    origin: (origin, callback) => {

        if (!origin) {
            callback(null, true);
            return;
        }

        if (
            allowedOrigins.includes(origin)
        ) {
            callback(null, true);
            return;
        }

        callback(
            new Error(
                `Origin not allowed: ${origin}`
            ),
            false
        );
    }
});


await app.register(createProfileRoute);
await app.register(updateProfileRoute);
await app.register(deleteProfileRoute);
await app.register(resolveProfileRoute);
await app.register(getProfileRoute);


app.get('/health', async () => {
    let database = false
    let cache = false

    try {
        await prisma.$queryRaw`SELECT 1`
        database = true
    } catch {
        database = false
    }

    try {
        const result = await redis.ping()
        cache = result === 'PONG'
    } catch {
        cache = false
    }

    return {
        status:
            database && cache
                ? 'ok'
                : 'degraded',

        version: process.env.APP_VERSION ?? 'dev',

        services: {
            database,
            redis: cache,
        },
    }
})

app.listen({
    host: '0.0.0.0',
    port: Number(process.env.PORT),
})