import { coordinateRetrieval, RetrievalRetryableError } from './retrieval-coordinator';

/**
 * How long Product `get` waits in total for requested AI enrichment (`shortName`,
 * `cutoutThumbnail`), including time queued behind the generation concurrency limits.
 * Production generation runs about 2.5s for a short name (Gemini observe p90 ~2.1s + Jev ~0.3s)
 * and about 3.5s for a cutout (Cloudflare transform p90 ~3.2s + R2 put ~0.6s), so a cold
 * 10-chip message clears both queues in roughly two waves (~7s). 20s leaves headroom for a
 * second concurrent message or one slow provider attempt, while staying inside an agent's
 * patience for one tool call.
 */
export const PRODUCT_ENRICHMENT_DEADLINE_MS = 20_000;

/**
 * Waits for shared enrichment work until `timeoutMs`. A deadline or generation failure settles
 * as `null` for this response while the shared work keeps running for the next request; only a
 * caller that has already gone away still rejects.
 */
export const waitForProductEnrichment = async <T>({
    key,
    work,
    signal,
    timeoutMs,
    label,
}: {
    key: string;
    work: () => Promise<T>;
    signal?: AbortSignal;
    timeoutMs: number;
    label: string;
}): Promise<T | null> => {
    try {
        return await coordinateRetrieval({ key, work, signal, timeoutMs });
    } catch (error) {
        if (error instanceof RetrievalRetryableError) {
            if (error.reason === 'caller_detached') {
                throw error;
            }
            return null;
        }
        console.error(`[${label}] Enrichment unavailable for this response:`, error);
        return null;
    }
};
