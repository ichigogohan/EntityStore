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

Redisを主な読み取り先として使用し、PostgreSQLを永続ストレージおよびRedisの復旧元として使用予定です。

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
