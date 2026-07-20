import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify, { FastifyInstance } from "fastify";

/**
 * create / update / delete / resolve は profileRepository（Redisキャッシュ+prisma）経由、
 * get だけは意図的に prisma を直接呼ぶ（キャッシュを介さない）構成になっている。
 *
 * このテストでは両方のモックが同じインメモリストアを参照するようにし、
 * 「作成 → 更新 → バージョン競合 → 削除 → 削除の冪等性 → 削除後の更新」
 * という一連のライフサイクルを、各ステップ後の GET で確認する。
 *
 * 各ルートの単体の分岐網羅は profile.create/update/delete/get/resolve.test.ts を参照。
 */

const { store } = vi.hoisted(() => {
    return { store: new Map<string, any>() };
});

// get.ts が直接読みにいく prisma 側
vi.mock("../src/lib/prisma.js", () => ({
    prisma: {
        profile: {
            findUnique: vi.fn(async ({ where: { id } }: any) => {
                return store.get(id) ?? null;
            }),
        },
    },
}));

// create/update/delete/resolve が使う profileRepository 側（同じstoreを操作する）
vi.mock("../src/repositories/profile.repository.js", () => ({
    profileRepository: {
        findById: vi.fn(async (id: string) => {
            return store.get(id) ?? null;
        }),
        findByIds: vi.fn(async (ids: string[]) => {
            return ids.map(id => store.get(id)).filter(Boolean);
        }),
        create: vi.fn(async (data: any) => {
            const record = {
                bio: null,
                iconUrl: null,
                metadata: null,
                version: 0,
                status: "active",
                ...data,
            };
            store.set(data.id, record);
            return record;
        }),
        update: vi.fn(async (id: string, data: any) => {
            const current = store.get(id);
            const next = {
                ...current,
                ...data,
                version: current.version + 1,
            };
            store.set(id, next);
            return next;
        }),
        delete: vi.fn(async (id: string) => {
            const current = store.get(id);
            const next = {
                ...current,
                status: "deleted",
                version: current.version + 1,
            };
            store.set(id, next);
            return next;
        }),
    },
}));

import { createProfileRoute } from "../src/routes/profiles/create.js";
import { updateProfileRoute } from "../src/routes/profiles/update.js";
import { deleteProfileRoute } from "../src/routes/profiles/delete.js";
import { getProfileRoute } from "../src/routes/profiles/get.js";

describe("プロフィールのライフサイクル（create → update → delete、getで都度確認）", () => {
    let app: FastifyInstance;

    beforeEach(async () => {
        store.clear();
        vi.clearAllMocks();
        app = Fastify();
        await app.register(createProfileRoute);
        await app.register(updateProfileRoute);
        await app.register(deleteProfileRoute);
        await app.register(getProfileRoute);
        await app.ready();
    });

    async function getProfile(id: string) {
        return app.inject({ method: "GET", url: `/profiles/${id}` });
    }

    it("一連の操作を通して正しい状態遷移になる（各ステップをGETで確認）", async () => {
        // 0. 作成前はまだ存在しない
        const beforeCreate = await getProfile("user-1");
        expect(beforeCreate.statusCode).toBe(404);

        // 1. 作成
        const createRes = await app.inject({
            method: "POST",
            url: "/profiles",
            payload: { id: "user-1" },
        });
        expect(createRes.statusCode).toBe(201);

        const afterCreate = await getProfile("user-1");
        expect(afterCreate.statusCode).toBe(200);
        expect(afterCreate.json()).toMatchObject({
            id: "user-1",
            name: "New User",
            status: "active",
            version: 0,
        });

        // 2. 同じidで再作成しようとすると409
        const dupRes = await app.inject({
            method: "POST",
            url: "/profiles",
            payload: { id: "user-1" },
        });
        expect(dupRes.statusCode).toBe(409);

        // 3. 正しいversionで更新 → version 0→1
        const updateRes1 = await app.inject({
            method: "PATCH",
            url: "/profiles/user-1",
            payload: { name: "Alice", bio: "Hello world", version: 0 },
        });
        expect(updateRes1.statusCode).toBe(200);

        const afterUpdate1 = await getProfile("user-1");
        expect(afterUpdate1.json()).toMatchObject({
            name: "Alice",
            bio: "Hello world",
            version: 1,
        });

        // 4. 古いversion(0)で更新しようとすると409、currentVersionは1
        const staleUpdateRes = await app.inject({
            method: "PATCH",
            url: "/profiles/user-1",
            payload: { name: "Bob", version: 0 },
        });
        expect(staleUpdateRes.statusCode).toBe(409);
        expect(staleUpdateRes.json()).toEqual({
            message: "Version conflict",
            currentVersion: 1,
        });

        const afterConflict = await getProfile("user-1");
        expect(afterConflict.json()).toMatchObject({ name: "Alice", version: 1 });

        // 5. 正しいversion(1)で削除 → status: deleted, version 1→2
        const deleteRes1 = await app.inject({
            method: "DELETE",
            url: "/profiles/user-1",
        });
        expect(deleteRes1.statusCode).toBe(200);

        const afterDelete1 = await getProfile("user-1");
        expect(afterDelete1.statusCode).toBe(200);
        expect(afterDelete1.json()).toMatchObject({ status: "deleted", version: 2 });

        // 6. 削除済みプロフィールを再度削除 → 204、versionは変化しない（冪等）
        const deleteRes2 = await app.inject({
            method: "DELETE",
            url: "/profiles/user-1",
        });
        expect(deleteRes2.statusCode).toBe(204);

        const afterDelete2 = await getProfile("user-1");
        expect(afterDelete2.json()).toMatchObject({ version: 2 });

        // 7. 削除済みプロフィールを更新しようとすると410
        const updateAfterDeleteRes = await app.inject({
            method: "PATCH",
            url: "/profiles/user-1",
            payload: { name: "Charlie", version: 2 },
        });
        expect(updateAfterDeleteRes.statusCode).toBe(410);
        expect(updateAfterDeleteRes.json()).toEqual({ message: "Profile deleted" });

        const finalState = await getProfile("user-1");
        expect(finalState.json()).toMatchObject({
            name: "Alice",
            status: "deleted",
            version: 2,
        });
    });

    it("存在しないidに対する get/update/delete はすべて404を返す", async () => {
        const getRes = await getProfile("ghost");
        expect(getRes.statusCode).toBe(404);

        const updateRes = await app.inject({
            method: "PATCH",
            url: "/profiles/ghost",
            payload: { name: "X", version: 0 },
        });
        expect(updateRes.statusCode).toBe(404);

        const deleteRes = await app.inject({
            method: "DELETE",
            url: "/profiles/ghost",
        });
        expect(deleteRes.statusCode).toBe(404);
    });
});
