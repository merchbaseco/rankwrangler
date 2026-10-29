import type { RouterOutputs } from '@/lib/trpc';

type Page = RouterOutputs['api']['app']['keywordDirectory'];
type Event = RouterOutputs['api']['app']['keyword']['directory']['changed'];
type Dependencies = {
    view: () => Page['view'] | undefined;
    read: (terms: string[], view: Page['view']) => Promise<Page['items']>;
    // Returns false when the cache is mid-fetch; a page arriving later would overwrite the patch.
    patch: (rows: Page['items'], terms: string[]) => boolean;
    reconcile: () => Promise<unknown>;
};

/**
 * Coalesces `keyword.directory.changed` events into serialized row reads of at most 100 terms.
 * A `resync` (listener ready or reconnected) reconciles the loaded pages once instead.
 */
export const createKeywordDirectoryEventUpdates = (deps: Dependencies) => {
    const pending = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let running = false;
    let disposed = false;
    let revision = 0;
    let resync = false;
    const schedule = () => {
        timer = setTimeout(() => {
            flush().catch(() => undefined);
        }, coalesceMs);
    };
    const flush = async () => {
        timer = null;
        if (running || disposed) {
            return;
        }
        running = true;
        try {
            while (!disposed && (resync || pending.size)) {
                if (resync) {
                    resync = false;
                    await deps.reconcile();
                    continue;
                }
                const terms = [...pending].slice(0, 100);
                for (const term of terms) {
                    pending.delete(term);
                }
                const version = revision;
                let view = deps.view();
                if (!view) {
                    await deps.reconcile();
                    view = deps.view();
                }
                if (!view) {
                    continue;
                }
                const rows = await deps.read(terms, view);
                if (disposed || version !== revision || deps.patch(rows, terms)) {
                    continue;
                }
                for (const term of terms) {
                    pending.add(term);
                }
                break;
            }
        } catch {
            pending.clear();
            if (!disposed) {
                await deps.reconcile().catch(() => undefined);
            }
        } finally {
            running = false;
            if (!disposed && (resync || pending.size) && !timer) {
                schedule();
            }
        }
    };
    return {
        onData: (event: Event) => {
            if (disposed) {
                return;
            }
            if (event.kind === 'resync') {
                revision += 1;
                pending.clear();
                resync = true;
            } else {
                for (const term of event.data.terms) {
                    pending.add(term);
                }
            }
            if (!timer && !running) {
                schedule();
            }
        },
        dispose: () => {
            disposed = true;
            revision += 1;
            pending.clear();
            if (timer) {
                clearTimeout(timer);
            }
        },
    };
};

const coalesceMs = 75;
