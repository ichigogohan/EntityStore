# EntityStore

システム全体の「ID」を人間が認識できる「表示情報（名前やアイコン）」へ変換・集約するクライアント/サーバー両対応の翻訳レイヤーサービスです。

各マイクロサービスが表示情報を重複保持しない設計（IDのみ管理）を実現し、表示情報の一元管理と耐障害性の向上を提供します。

---

## 目的・メリット

- **表示情報の一元管理:** 名前やアイコン変更時、各サービスへの伝播更新が不要。
- **疎結合＆障害耐性:** EntityStore停止時も主要機能は停止せず、フォールバック（`Unknown-User`表示）やキャッシュで継続動作。

---

## 技術スタック & プロジェクト構成

```text
.
├─ packages/entity-store/     # クライアントライブラリ (TS, Memory Cache, IndexedDB)
├─ services/profile-server/   # Entity Profile API (Fastify, Prisma, Redis, PostgreSQL)
└─ playground/                # 動作確認用 Vite アプリ

```

* **Server:** Node.js, Fastify, TypeScript, Prisma, Redis, PostgreSQL, Docker
* **Client:** TypeScript

---

## キャッシュ & 通信最適化 (Client)

* **2層キャッシュ:** 同期的に読める `Memory Cache` ＋ ブラウザ永続化の `IndexedDB`
* **Resolve Queue:** 短時間の複数 `get` 要求を集約・重複排除し、1回のAPIリクエスト（`POST /profiles/resolve`）で効率送信。
* **楽観的ロック / バージョン制御:** クライアントとサーバーの `version` を比較し、差分のみを取得。



---

## 拡張性 (Future Scope)

現在はユーザープロフィールを主としていますが、ID体系が統一されていれば Group / Channel / Bot などあらゆるEntityの表示情報統合レイヤーとして拡張可能な設計になっています。


## 起動方法

Docker Compose v2を使用します。

```bash
cp .env.example .env
# .envのPOSTGRES_PASSWORDなどを設定してから起動
docker compose up --build -d
```

PostgreSQLのhealthcheck成功後、`migrate`サービスが`prisma migrate deploy`を実行します。
正常終了した場合だけ`profile`サービスが起動します。`prisma generate`はビルド時の
クライアント生成であり、DBのテーブル作成は`migrate`が担当します。

### 状態確認・手動操作

```bash
docker compose logs --tail=100 migrate profile postgres redis
docker compose run --rm migrate npm run db:status
docker compose run --rm migrate npm run db:migrate
docker compose exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
docker compose exec redis redis-cli ping
```

PostgreSQLとRedisのホスト向けポートは公開していません。内部接続はそれぞれ
`postgres:5432`と`redis:6379`です。RedisはこのComposeの内部ネットワークで
パスワードなしで使用します。Compose外で起動する場合は接続先を別途設定してください。

### 既存DBへの導入

1. 既存DBのバックアップを取得します（例は下記）。
2. マイグレーションの適用状況を確認し、履歴と実スキーマに不一致がないことを確認します。
3. `docker compose up --build -d`で起動します。適用失敗時はログを確認し、修正後に再実行します。

```bash
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > profile-backup.sql
```

既に`Profile`テーブルがあり履歴がない場合は、テーブル定義・インデックスが
`prisma/migrations/20260708070009_init/migration.sql`と一致することを確認してから、
次のコマンドで初期マイグレーションを適用済みとして登録します。不一致なら実行せず、
先に差分を調査してください。

```bash
docker compose run --rm migrate npx prisma migrate resolve --applied 20260708070009_init
```

データを保持するため、`prisma migrate reset`や`docker compose down -v`は使用しません。
既存ボリュームでは`.env`の`POSTGRES_USER`・`POSTGRES_PASSWORD`・`POSTGRES_DB`を変更しても、
DB内の認証情報・データベースは自動変更されません。
