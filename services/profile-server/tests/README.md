# Profile ルート ユニットテスト（Vitest）

## 構成

```
tests/
├─ profile.create.test.ts     ... POST /profiles
├─ profile.update.test.ts     ... PATCH /profiles/:id
├─ profile.delete.test.ts     ... DELETE /profiles/:id
├─ profile.get.test.ts        ... GET /profiles/:id
├─ profile.resolve.test.ts    ... POST /profiles/resolve（クライアントversionとの差分解決）
├─ profile.repository.test.ts ... ProfileRepository（Redisキャッシュ層、HTTPを介さないクラス単体テスト）
└─ profile.lifecycle.test.ts  ... 4ルートを跨いだ状態遷移の統合テスト（各ステップをGETで確認）
```

`profile.repository.test.ts` は Fastify ルートではなく、`prisma` と `redis` の両方をモックして
`ProfileRepository` クラスのメソッドを直接呼び出す形式のテストです。

`get.ts` は当初「デバッグ用・将来置き換え予定」とのことで単体テストの対象外にしていましたが、
lifecycleテストの内部状態確認に使う方針をいただいたため、`profile.get.test.ts` を追加し、
lifecycleテストでもインメモリストアを直接覗く代わりに実際に `GET` を呼び出す形に変更しています。

## 前提

```
src/
├─ index.ts
├─ lib/prisma.js
├─ lib/redis.js
├─ repositories/profile.repository.ts
├─ routes/profiles/{create,delete,get,update,resolve}.ts
└─ types/profile.ts
```

## 実行方法

```bash
npm install -D vitest
npx vitest run
```
