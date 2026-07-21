import { faker } from "@faker-js/faker";

import { prisma } from "../src/lib/prisma.js";
import { redis } from "../src/lib/redis.js";

async function main() {

    console.log("Cleaning database...");

    await prisma.profile.deleteMany();

    console.log("Cleaning redis...");

    const profileKeys =
        await redis.keys("profile:*");

    if (profileKeys.length > 0) {
        await redis.del(profileKeys);
    }

    const profiles = [];

    for (let i = 0; i < 5000; i++) {

        const id =
            `u${i.toString().padStart(4, "0")}`;

        profiles.push({
            id,

            name:
                faker.person.fullName(),

            bio:
                faker.person.bio(),

            iconUrl:
                faker.image.avatar(),

            metadata: {},

            status: "active",

            version: 1,
        });
    }

    console.log(
        `Creating ${profiles.length} demo profiles...`
    );

    await prisma.profile.createMany({
        data: profiles,
    });

    console.log(
        `Created ${profiles.length} demo profiles`
    );
}

main()
    .catch(error => {

        console.error(error);

        process.exitCode = 1;
    })
    .finally(async () => {

        await prisma.$disconnect();
        await redis.quit();
    });