# profile-server

## 技術スタック

### Server

- TypeScript
- Node.js
- Fastify
- Prisma
- Redis
- PostgreSQL
- Docker

PostgreSQLを正本とし、通常の読み取りはRedisを優先します（`GET /profiles/:id`はDBの直接参照です）。
DB書き込み成功後、Redisへの即時反映も試します。Redisだけ失敗した場合は警告ログを残し、
APIは成功を返します。Outboxや専用の再試行ワーカーは使用しません。

### Redisキャッシュ

- キーは`profile:v2:<id>`、TTLは保存から60秒です。読み取りでは延長しません。
- キャッシュ未存在・読み取り失敗・不正データ時はDBへフォールバックし、再保存を試します。
- 作成・更新・削除の結果もTTL付きで保存します。キャッシュ保存失敗でもDBの変更は保持します。
- Redis操作は1秒でタイムアウトし、未接続時のキューや要求単位の再試行は行いません。
- 同時処理の順序次第で一時的に古い値が保存されることは許容します。その値も保存から60秒で失効します。
- クライアント側には別途5分のTTLがあります。画面への反映を更新から60秒以内とは保証しません。
- Redis停止時にはDBへの負荷が増えます。DBまで停止した場合は読み取り・更新に失敗することがあります。

### 既存キャッシュからの切り替え

TTLのない旧`profile:<id>`キーは参照しません。新バージョンへの切り替え確認後、
Redisコンテナ内で旧キーだけをSCANして削除できます。新しい`profile:v2:`キーは除外します。
ローリング切り替えの場合は旧バージョンの停止後に実行してください。

```bash
docker compose exec redis sh -c 'redis-cli --scan --pattern "profile:*" | while IFS= read -r key; do case "$key" in profile:v2:*) ;; *) redis-cli UNLINK "$key" ;; esac; done'
```

この手順は改行を含まない通常のプロフィールIDを前提とします。キー一覧を確認してから実行し、
専用Redis以外では他アプリのキーが同じプレフィックスを使っていないことも確認してください。

---

## Database

### Entity Profile

サーバー側では、Entity Profileを次の構造で管理します。

```text
id          TEXT PRIMARY KEY
name        TEXT NOT NULL
bio         TEXT NULL
iconUrl     TEXT NULL
version     INTEGER NOT NULL
status      TEXT NOT NULL
metadata    JSONB NULL
createdAt   TIMESTAMP
updatedAt   TIMESTAMP
```

---

## Resolve API

### Endpoint

```http
POST /profiles/resolve
```

### Request

クライアントが保持しているEntity IDとバージョンを送信します。

```json
{
    "profiles": {
        "u0001": 4,
        "u0002": 12,
        "u0003": 1
    }
}
```

`profiles` のキーはEntity ID、値はクライアントが保持しているバージョンです。

---

### Response

更新が必要な Entity、または状態が変更された Entity のみを返します。

```json
{
    "profiles": {
        "u0001": {
            "id": "u0001",
            "name": "Name",
            "bio": "Bio text",
            "iconUrl": "[https://example.com/icon.png](https://example.com/icon.png)",
            "version": 5,
            "status": "active",
            "metadata": {}
        },
        "u0002": {
            "id": "u0002",
            "status": "deleted",
            "version": 3
        },
        "u0050": {
            "id": "u0050",
            "status": "unknown"
        }
    }
}

```

#### Status 別レスポンスの挙動

* **`active` (有効)**
* 最新の表示情報（`name`, `iconUrl` 等）とインクリメントされた `version` を返します。


* **`deleted` (削除済み)**
* 対象 Entity が削除されている場合、`status: "deleted"` とその時点の `version` を返します。


* **`unknown` (未存在)**
* データベース上に存在しない Entity ID の場合、最小限の情報として `id` と `status: "unknown"` のみを返します。



### Versioning Rules

Entity の情報が更新・削除される際、サーバー側で自動的にバージョンをインクリメントします（`version = version + 1`）。

* `clientVersion !== serverVersion`: サーバー側の最新 Entity 情報をレスポンスに含める
* `clientVersion === serverVersion`: 差分なしと判断し、レスポンスの `profiles` から対象 ID を省略する

```


## DB書き込みと競合制御

更新のversion・active状態はRedisではなくPostgreSQLのUPDATE条件で照合します。
同じversionの同時更新は一方だけ成功し、他方は409と`currentVersion`を返します。
存在しないIDは404、削除済みの更新は410です。versionはDBの初期値1以上の整数が必須です。
作成競合は主キー制約で409へ変換し、削除済みの再削除は204でversionを維持します。
