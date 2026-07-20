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

```bash
# コンテナの立ち上げ
docker compose up -d

