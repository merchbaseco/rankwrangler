import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { env } from '@/config/env';
import {
    claimShortNameGeneration,
    failShortNameGeneration,
    finishShortNameGeneration,
    getStoredShortName,
    isCurrentShortNameInput,
} from '@/db/product/product-short-name-store';
import { createConcurrencyLimit } from './concurrency-limit';
import { createEventLogSafe } from './event-logs';
import { observeProductDesign, type ProductDesignObservation } from './product-design-observation';
import { waitForProductEnrichment } from './product-enrichment-wait';
import {
    prepareShortNameRequest,
    readStoredShortName,
    type ShortNameRequest,
    type ShortNameSource,
    shortNameRetrievalKey,
} from './product-short-name-request';
import { captureProviderAttempt } from './providers/provider-telemetry';
import { startDetachedRetrieval } from './retrieval-coordinator';

const JEV_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
const JEV_TIMEOUT_MS = 8000;
const POLL_MS = 250;
/**
 * Process-wide cap on short-name generations (one Gemini observation + one Jev choice each).
 * Neither provider publishes a per-key concurrency limit that binds at this volume (Gemini Flash
 * Lite paid tiers allow thousands of requests per minute), so the cap bounds this process: each
 * job holds a source image of up to 2 MB in memory, and a job claims its row only once it holds a
 * slot, so queueing never burns the 30s claim lease. Eight clears a typical 10-chip message in
 * two ~2.5s waves.
 */
export const SHORT_NAME_GENERATION_CONCURRENCY = 8;
const generationSlots = createConcurrencyLimit(SHORT_NAME_GENERATION_CONCURRENCY);
const choiceSchema = z.object({
    answers: z.object({
        shortName: z.object({ type: z.literal('choice'), choice: z.string() }),
    }),
});

/**
 * Waits up to `timeoutMs` for the short name. Slow or failed generation settles as `null` for
 * this response; generation keeps running so a later request reads the finished value.
 */
export const getProductShortName = async ({
    signal,
    timeoutMs,
    ...source
}: ShortNameSource & { signal?: AbortSignal; timeoutMs: number }): Promise<string | null> => {
    const request = prepareShortNameRequest(source);
    if (!request) {
        return null;
    }
    return await waitForProductEnrichment({
        key: shortNameRetrievalKey(request),
        signal,
        timeoutMs,
        label: 'Product Short Name',
        work: () => resolveShortName(request),
    });
};

/** Starts or joins generation without waiting; the same key `get` callers wait on. */
export const startProductShortNameGeneration = (request: ShortNameRequest) =>
    startDetachedRetrieval({
        key: shortNameRetrievalKey(request),
        work: () => resolveShortName(request),
        onError: error => {
            console.error('[Product Short Name] Background generation failed:', error);
        },
    });

export const chooseProductShortName = async ({
    title,
    observation,
    candidates,
    fetcher = fetch,
    capture = captureProviderAttempt,
}: {
    title: string;
    observation: ProductDesignObservation;
    candidates: string[];
    fetcher?: typeof fetch;
    capture?: typeof captureProviderAttempt;
}): Promise<string | null> => {
    if (!env.RANKWRANGLER_TYPESAFE_API_KEY) {
        throw new Error('RANKWRANGLER_TYPESAFE_API_KEY is required for Product short names.');
    }

    const response = await capture(
        { provider: 'typesafe', operation: 'typesafe.productShortName.choose' },
        () =>
            fetcher(JEV_ENDPOINT, {
                method: 'POST',
                headers: {
                    authorization: `Bearer ${env.RANKWRANGLER_TYPESAFE_API_KEY}`,
                    'content-type': 'application/json',
                },
                body: JSON.stringify({
                    model: 'jev-1.13.0',
                    state: {
                        listingTitle: title,
                        printedText: observation.visibleText,
                        visualMotifs: observation.visualMotifs,
                        observedDesignName: observation.shortDesignName,
                    },
                    questions: {
                        shortName: {
                            type: 'choice',
                            instructions:
                                'Choose the shortest candidate that uniquely identifies this design. A coined term, pun, or self-contained joke phrase in the printed text is distinctive by itself; do not append pictured motifs or marketing adjectives to one. A common occasion label is not distinctive by itself: include a pictured motif named in the title when that motif sets this artwork apart. Match visual synonyms, such as bead-and-charm strands supporting a title phrase about bracelets. `printedText`, `visualMotifs`, and `observedDesignName` are image observations; the listing title may contain SEO phrases or alternate slogans. For a longer printed joke, favor its opening standalone phrase when it names the design; do not choose an ending fragment merely because it is shorter. Treat `observedDesignName` as a useful clue, not as ground truth. Include title words beyond the visible design only when the image supports them. Select NONE if no candidate fits the image evidence.',
                            criteria: Object.fromEntries([
                                ['NONE', 'No candidate accurately names the visible design.'],
                                ...candidates.map(candidate => [candidate, null]),
                            ]),
                        },
                    },
                }),
                signal: AbortSignal.timeout(JEV_TIMEOUT_MS),
            })
    );
    if (!response.ok) {
        throw new Error(`TypeSafe Product short-name request failed (${response.status}).`);
    }

    const payload = choiceSchema.parse(await response.json());
    const selected = payload.answers.shortName.choice;
    if (selected === 'NONE') {
        return null;
    }
    if (!candidates.includes(selected)) {
        throw new Error('TypeSafe selected a Product short name outside the candidate set.');
    }
    return formatShortName(selected);
};

const resolveShortName = async (request: ShortNameRequest): Promise<string | null> => {
    const { marketplaceId, asin, title, imageUrl, inputFingerprint } = request;
    const identity = { marketplaceId, asin };
    while (true) {
        if (!(await isCurrentShortNameInput({ ...identity, title, imageUrl }))) {
            return null;
        }
        const stored = readStoredShortName(await getStoredShortName(identity), inputFingerprint);
        if (stored.state === 'ready') {
            return stored.shortName;
        }
        if (stored.state === 'failed') {
            return null;
        }
        if (!(env.RANKWRANGLER_GEMINI_API_KEY && env.RANKWRANGLER_TYPESAFE_API_KEY)) {
            throw new Error('Product short-name providers are not configured.');
        }

        const result = await generationSlots.run(async () => {
            const claimId = randomUUID();
            return (await claimShortNameGeneration({ ...identity, inputFingerprint, claimId }))
                ? await generateClaimedShortName(request, claimId)
                : ({ kind: 'claimed-elsewhere' } as const);
        });
        if (result.kind === 'ready') {
            return result.shortName;
        }
        if (result.kind === 'claimed-elsewhere') {
            await new Promise(resolve => setTimeout(resolve, POLL_MS));
        }
    }
};

const generateClaimedShortName = async (
    request: ShortNameRequest,
    claimId: string
): Promise<{ kind: 'ready'; shortName: string | null } | { kind: 'superseded' }> => {
    const { marketplaceId, asin, title, imageUrl, candidates } = request;
    const identity = { marketplaceId, asin };
    try {
        const observation = await observeProductDesign(imageUrl);
        const shortName = observation
            ? await chooseProductShortName({ title, observation, candidates })
            : null;
        const saved = await finishShortNameGeneration({
            ...identity,
            claimId,
            shortName,
            title,
            imageUrl,
        });
        if (!saved) {
            return { kind: 'superseded' };
        }
        await createEventLogSafe({
            level: 'info',
            status: 'success',
            category: 'product',
            action: 'product.shortName.generate',
            primitiveType: 'product',
            message: `Generated short name for ${asin}.`,
            marketplaceId,
            asin,
            detailsJson: { outcome: shortName ? 'named' : 'abstained' },
        });
        return { kind: 'ready', shortName };
    } catch (error) {
        await failShortNameGeneration({ ...identity, claimId });
        await createEventLogSafe({
            level: 'error',
            status: 'failed',
            category: 'product',
            action: 'product.shortName.generate',
            primitiveType: 'product',
            message: `Short-name generation failed for ${asin}.`,
            marketplaceId,
            asin,
        });
        throw new Error(`Product short-name generation failed for ${asin}.`, { cause: error });
    }
};

const LOWERCASE_CONNECTORS = new Set([
    'and',
    'at',
    'by',
    'for',
    'from',
    'in',
    'of',
    'on',
    'or',
    'the',
    'to',
    'with',
]);

const formatShortName = (name: string) =>
    name.replace(/\p{L}[\p{L}\p{N}'’]*/gu, (word, offset: number) => {
        if (
            word !== word.toLowerCase() ||
            (offset > 0 && LOWERCASE_CONNECTORS.has(word.toLowerCase()))
        ) {
            return word;
        }
        return word[0].toUpperCase() + word.slice(1);
    });
