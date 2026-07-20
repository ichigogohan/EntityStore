export class ResolveQueue {

    private readonly queue = new Set<string>();

    private timer?: number;

    constructor(
        private readonly flush: (
            ids: string[]
        ) => Promise<void>,

        private readonly delay = 10 // 一応10msで
    ) {}

    enqueue(id: string): void {
        this.queue.add(id);

        if (this.timer) {
            return;
        }

        this.timer = window.setTimeout(
            async () => {
                this.timer = undefined;

                const ids = [
                    ...this.queue,
                ];
                this.queue.clear();

                try {
                    await this.flush(ids);
                } catch (error) {
                    console.error(
                        "ResolveQueue: flush failed",
                        error
                    );
                }
            },
            this.delay
        );
    }
}