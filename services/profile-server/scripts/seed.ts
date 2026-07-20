import { faker } from "@faker-js/faker";

import { prisma } from "../src/lib/prisma.js";

async function main() {

    const profiles = [];

    for (let i = 0; i < 50; i++) {
        
        const id = `u${i.toString().padStart(4, "0")}`;
        
        profiles.push({
            id: id,

            name: faker.person.fullName(),

            bio: faker.person.bio(),

            iconUrl: faker.image.avatar(),

            metadata: {},

            status: "active",
        });
    }

    await prisma.profile.createMany({
        data: profiles,
    });

    console.log(
        `Created ${profiles.length} profiles`
    );
}

main()
    .finally(async () => {
        await prisma.$disconnect();
    });