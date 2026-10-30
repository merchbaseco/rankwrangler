import { AsyncLocalStorage } from 'node:async_hooks';

type Span = { name: string; ms: number };
const spans = new AsyncLocalStorage<Span[]>();

/** Collects `measure` spans for everything `work` starts; the server reports them per request. */
export const collectRequestTiming = <T>(collected: Span[], work: () => T) =>
    spans.run(collected, work);

/** Times one phase of the current request for `Server-Timing`; outside a request it only runs. */
export const measure = async <T>(name: string, work: () => Promise<T>): Promise<T> => {
    const collected = spans.getStore();
    const started = performance.now();
    try {
        return await work();
    } finally {
        collected?.push({ name, ms: performance.now() - started });
    }
};
