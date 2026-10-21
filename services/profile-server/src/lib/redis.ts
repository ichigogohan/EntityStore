import { Redis } from "ioredis";

export const redis = new Redis(process.env.REDIS_URL!, {
    connectTimeout: 1000,
    commandTimeout: 1000,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 0,
    autoResendUnfulfilledCommands: false,
    retryStrategy: times => Math.min(times * 100, 2000),
});

let unavailable = false;
redis.on("error", () => {
    if (!unavailable) {
        console.warn("Redis unavailable; profile reads will fall back to PostgreSQL");
        unavailable = true;
    }
});
redis.on("ready", () => { unavailable = false; });
