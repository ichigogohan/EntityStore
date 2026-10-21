# Profile APIのテスト

## 単体テスト・型チェック

```bash
npm ci
# Prisma CLIの設定読込用。generateはDBには接続しません。
DATABASE_URL=postgresql://profile:password@localhost:5432/profile_test npx prisma generate
npm run typecheck
npm test
```

ルートのテストはRepositoryを、RepositoryのテストはPrismaとRedisをモックします。
作成の有効・無効はテスト内で環境変数を設定・復元します。
ライフサイクルテストもモックであり、実DBの競合制御の検証は下記で行います。

## 実PostgreSQL・Redisの結合テスト

専用の空DBと専用Redisを用意し、接続先を設定します。本番・共有環境を指定しないでください。
テストはUUID付きのIDを作成し、終了時にそのデータとキャッシュだけを削除します。
Redis障害のテストはアプリの接続を切断し、サーバーや他の接続は停止しません。

```bash
export DATABASE_URL=postgresql://profile:password@localhost:5432/profile_test
export REDIS_URL=redis://localhost:6379
npx prisma migrate deploy
npm run test:integration
```

同時作成・同時更新・同時削除、古いキャッシュとDBのversion比較、TTLの失効・再取得、
不正なキャッシュの修復、Redis切断時のAPI成功と再接続後の補充を検証します。
TTLテストは実際の保存時に60秒を確認した後、テスト対象キーだけ期限を短縮して失効を待ちます。
GitHub Actionsの`Profile database`でも専用サービスを使って同じ検証を行います。
