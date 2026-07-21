import type { EntityProfile } from "./app";
import { store } from "./api";
import { recordRequestedItem } from "./stats";

export interface FeedOptions {
    /** 項目を追加していくコンテナ要素 */
    container: HTMLElement;
    /** 下端検知用の要素(container の直後に常設しておく) */
    sentinel: HTMLElement;
    /** DOM上に保持する最大件数。超えた分は先頭(古い方)から削除する */
    windowSize: number;
    /** 次に読み込むIDの配列を返す。もう読み込むものがなければ null */
    nextIds: () => string[] | null;
    /** 1件分のHTML(ルート要素は1つ) */
    renderItem: (profile: EntityProfile) => string;
    /** これまでに読み込んだ延べ件数が変わるたびに呼ばれる(進捗表示用、任意) */
    onLoadedCountChange?: (totalLoaded: number) => void;
}

export interface Feed {
    destroy(): void;
}

interface FeedItem {
    el: HTMLElement;
    unsubscribe: () => void;
}

export function createFeed(options: FeedOptions): Feed {
    const { container, sentinel, windowSize, nextIds, renderItem, onLoadedCountChange } = options;

    const items: FeedItem[] = [];
    let loading = false;
    let exhausted = false;
    let loadedTotal = 0;

    function loadNextBatch() {
        if (loading || exhausted) return;

        const ids = nextIds();
        if (!ids || ids.length === 0) {
            exhausted = true;
            observer.unobserve(sentinel);
            return;
        }

        loading = true;

        ids.forEach((id) => {
            recordRequestedItem();

            const el = document.createElement("div");
            el.innerHTML = renderItem(store.get(id));
            container.appendChild(el);

            const unsubscribe = store.subscribe(id, (updated: EntityProfile) => {
                el.innerHTML = renderItem(updated);
            });

            items.push({ el, unsubscribe });
        });

        loadedTotal += ids.length;
        onLoadedCountChange?.(loadedTotal);

        enforceWindow();
        loading = false;
    }

    function enforceWindow() {
        if (items.length <= windowSize) return;

        const removed = items.splice(0, items.length - windowSize);
        const removedHeight = removed.reduce((sum, item) => sum + item.el.offsetHeight, 0);

        removed.forEach((item) => {
            item.unsubscribe();
            item.el.remove();
        });

        // 上部(古い方)の要素を消すと見た目が上にジャンプするため、
        // 消した高さの分だけスクロール位置を補正して視界を維持する。
        const scroller = document.scrollingElement ?? document.documentElement;
        scroller.scrollTop -= removedHeight;
    }

    const observer = new IntersectionObserver(
        (entries) => {
            if (entries.some((entry) => entry.isIntersecting)) {
                loadNextBatch();
            }
        },
        { rootMargin: "600px 0px 600px 0px" }
    );
    observer.observe(sentinel);

    loadNextBatch();

    return {
        destroy() {
            observer.disconnect();
            items.forEach((item) => item.unsubscribe());
            items.length = 0;
        },
    };
}