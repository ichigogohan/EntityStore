# EntityStore API Contract

`EntityStore` は、エンティティ情報の取得、キャッシュ、更新確認、および変更通知を提供します。

キャッシュされたデータはメモリ上に保持され、IndexedDBへ永続化されます。  
通常の読み取り処理は、常にメモリキャッシュを参照します。

---

## Initialization

`EntityStore` は、非同期ファクトリーメソッド `EntityStore.create()` を使用して生成します。

```ts
const store = await EntityStore.create({
    endpoint: "http://localhost:3000",
});
```

### Options

```ts
interface EntityStoreOptions {
    endpoint: string;
}
```

#### `endpoint`

Resolve APIを提供するサーバーのベースURLです。

### Initialization behavior

初期化時に、IndexedDBへ保存されているキャッシュをメモリへ展開します。

```text
EntityStore.create()
└─ IndexedDBからキャッシュを読み込む
   └─ メモリキャッシュへ展開
      └─ EntityStoreを返す
```

`EntityStore.create()` が完了した後、すべての同期読み取りはメモリキャッシュのみを参照します。

---

## EntityProfile

エンティティ情報を表す型です。

```ts
type EntityStatus =
    | "active"
    | "deleted"
    | "unknown";

interface EntityProfile {
    id: string;
    name: string;
    bio?: string | null;
    iconUrl?: string | null;
    version: number;
    status: EntityStatus;
    metadata?: unknown;
}
```

### Status

- `active`
  - 有効なエンティティです。
- `deleted`
  - 削除されたエンティティです。
- `unknown`
  - サーバーに存在しない、またはまだ解決されていないエンティティです。

---

## `get()`

メモリキャッシュからエンティティ情報を同期的に取得します。

```ts
const profile = store.get("u0001");
```

### Signature

```ts
get(id: string): EntityProfile
```

### Behavior

#### Cache hit

キャッシュが有効期限内の場合、その内容を直ちに返します。

```text
Memory Cache
└─ Hit
   └─ Cached Profileを返す
```

キャッシュが期限切れの場合、現在の内容を直ちに返した後、バックグラウンドでResolveを開始します。

```text
Memory Cache
└─ Hit
   └─ Expired
      ├─ Cached Profileを返す
      └─ Resolveをキューへ追加
```

#### Cache miss

キャッシュが存在しない場合、一時的なUnknownプロファイルを作成して返します。

同時に、対象IDのResolveをバックグラウンドで開始します。

```text
Memory Cache
└─ Miss
   ├─ Unknown Profileを作成
   ├─ Memory Cacheへ保存
   ├─ Resolveをキューへ追加
   └─ Unknown Profileを返す
```

`get()` はIndexedDBへ直接アクセスしません。

---

## `getLatest()`

サーバーへ問い合わせた後、最新のエンティティ情報を取得します。

```ts
const profile = await store.getLatest("u0001");
```

### Signature

```ts
getLatest(id: string): Promise<EntityProfile>
```

### Behavior

```text
Resolve
└─ Memory Cacheを更新
   └─ get()
      └─ EntityProfileを返す
```

Resolve完了後、更新されたメモリキャッシュの内容を返します。

---

## `resolve()`

指定したエンティティについて、サーバーへ更新確認を行います。

```ts
await store.resolve([
    "u0001",
    "u0002",
]);
```

### Signature

```ts
resolve(ids: string[]): Promise<void>
```

### Behavior

```text
対象IDの現在バージョンを取得
└─ Resolve APIへ送信
   └─ 応答内容をMemory Cacheへ保存
      ├─ IndexedDBへの保存を開始
      └─ Subscriberへ通知
```

キャッシュ更新時、メモリキャッシュは即時更新されます。

IndexedDBへの保存はWrite-behind方式で実行されるため、キャッシュ更新処理はIndexedDBへの保存完了を待ちません。

サーバーから更新後のプロファイルが返されなかった場合は、現在のキャッシュ内容を維持し、最終確認時刻のみ更新します。

---

## `subscribe()`

指定したエンティティの更新通知を購読します。

```ts
const unsubscribe = store.subscribe(
    "u0001",
    profile => {
        console.log(profile.name);
    },
);
```

### Signature

```ts
subscribe(
    id: string,
    listener: EntityUpdateListener,
): () => void
```

### Listener

```ts
type EntityUpdateListener = (
    profile: EntityProfile,
) => void;
```

### Return value

購読を解除する関数を返します。

```ts
unsubscribe();
```

### Notification behavior

Subscriberは、Resolve APIから新しいエンティティ情報を受信し、キャッシュが更新されたときに呼び出されます。

ローカルでUnknownプロファイルが作成された場合は通知されません。

---

## `clear()`

すべてのキャッシュと購読状態を削除します。

```ts
await store.clear();
```

### Signature

```ts
clear(): Promise<void>
```

### Behavior

```text
Memory Cacheを削除
├─ Listenerを削除
├─ Resolve Stateを削除
├─ 保留中のIndexedDB書き込みを完了
└─ IndexedDB Cacheを削除
```

`clear()` はIndexedDBの削除完了を待つため、非同期メソッドです。

---

## `debugCache()`

現在のメモリキャッシュの内容を取得します。

```ts
const cache = store.debugCache();
```

このメソッドはデバッグ用途です。  
返される内容はメモリキャッシュのスナップショットであり、IndexedDBを直接読み取りません。

---

# Cache Behavior

## Read flow

```text
EntityStore.get()
└─ Memory Cacheのみを参照
```

IndexedDBは、`EntityStore.create()` による初期化時にのみ読み込まれます。

## Write flow

```text
Cache Update
├─ Memory Cacheを即時更新
└─ IndexedDBへ非同期保存
```

IndexedDBへの書き込みはWrite-behind方式です。

## Persistent storage

IndexedDBでは次の設定を使用します。

```text
Database: entity-store
Table: entities
Primary Key: id
```

保存されるレコードは、エンティティ情報と最終確認時刻を含みます。

```ts
interface CachedProfile {
    profile: EntityProfile;
    lastVerifiedAt: number;
}
```
