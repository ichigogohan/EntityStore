/**
 * ネットワーク負荷の計測
 *
 * - requestedCount: feed.ts が store.get(id) を呼んだ延べ回数
 *   (バッチ化・キャッシュを考慮しない、単純に「表示しようとした件数」)
 * - networkRequestCount: 実際に発生した /profiles/resolve への
 *   HTTPリクエスト数(PerformanceObserverで実測)。バッチ化の効果を含む。
 * - sentIdCount: resolve のリクエストボディに実際に含まれていた
 *   延べID数(= サーバーへ「バージョンを教えて」と問い合わせた件数)
 * - unchangedIdCount: そのうち、レスポンスに含まれていなかった
 *   (= clientVersion === serverVersion で本文が返却されなかった、
 *      つまりキャッシュがそのまま使い回された)延べID数
 *
 * API_CONTRACT.md の「clientVersion !== serverVersion → 返却対象」という
 * ルールより、レスポンスに含まれていないIDはバージョン一致でキャッシュが
 * そのまま使われたことを意味する。これはバッチ化の影響を受けない、
 * 「キャッシュそのものの効き具合」を示す指標になる。
 */

let requestedCount = 0;
let networkRequestCount = 0;
let sentIdCount = 0;
let unchangedIdCount = 0;

const listeners = new Set<() => void>();

function notify() {
    listeners.forEach((listener) => listener());
}

export function recordRequestedItem() {
    requestedCount += 1;
    notify();
}

function recordResolveBatch(sent: number, returned: number) {
    sentIdCount += sent;
    unchangedIdCount += Math.max(sent - returned, 0);
    notify();
}

export function getStats() {
    return { requestedCount, networkRequestCount, sentIdCount, unchangedIdCount };
}

export function resetStats() {
    requestedCount = 0;
    networkRequestCount = 0;
    sentIdCount = 0;
    unchangedIdCount = 0;
    notify();
}

export function subscribeStats(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

if (typeof PerformanceObserver !== "undefined") {
    const observer = new PerformanceObserver((list) => {
        let matched = 0;

        for (const entry of list.getEntries()) {
            if (entry.name.includes("/profiles/resolve")) {
                matched += 1;
            }
        }

        if (matched > 0) {
            networkRequestCount += matched;
            notify();
        }
    });

    observer.observe({ type: "resource", buffered: true });
}

/* -------------------------------------------------------------------- */
/* /profiles/resolve のリクエスト/レスポンスボディを直接覗く               */
/* -------------------------------------------------------------------- */

function extractProfileIds(body: unknown): string[] {
    if (typeof body !== "string") return [];

    try {
        const parsed = JSON.parse(body);
        return parsed?.profiles ? Object.keys(parsed.profiles) : [];
    } catch {
        return [];
    }
}

if (typeof window !== "undefined" && typeof window.fetch === "function") {
    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

        if (!url.includes("/profiles/resolve")) {
            return originalFetch(input, init);
        }

        const sentIds = extractProfileIds(init?.body);
        const response = await originalFetch(input, init);

        // レスポンスbody本体はライブラリ側が消費するため、clone()して覗くだけにする。
        response
            .clone()
            .json()
            .then((json) => {
                const returnedIds: string[] = json?.profiles ? Object.keys(json.profiles) : [];
                recordResolveBatch(sentIds.length, returnedIds.length);
            })
            .catch((e) => {
                console.error(e);
                // レスポンス形式が想定と異なる場合は計測をスキップする(実処理には影響しない)。
            });

        return response;
    };
}