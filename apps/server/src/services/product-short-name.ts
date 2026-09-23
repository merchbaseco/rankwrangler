import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { env } from '@/config/env';
import {
    claimShortNameGeneration,
    failShortNameGeneration,
    finishShortNameGeneration,
    getStoredShortName,
    isCurrentShortNameInput,
    SHORT_NAME_ERROR_RETRY_MS,
} from '@/db/product/product-short-name-store';
import type { ProductThumbnail } from '@/types';
import { createEventLogSafe } from './event-logs';
import { observeProductDesign, type ProductDesignObservation } from './product-design-observation';
import { buildShortNameCandidates } from './product-short-name-candidates';
import { captureProviderAttempt } from './providers/provider-telemetry';
import { coordinateRetrieval, RetrievalRetryableError } from './retrieval-coordinator';

const JEV_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
const JEV_TIMEOUT_MS = 8000;
const CALLER_TIMEOUT_MS = 24_000;
export const SHORT_NAME_GENERATOR_VERSION = 'gemini-3.1-flash-lite-low+jev-1.13.0:v1';
const POLL_MS = 250;
const choiceSchema = z.object({
    answers: z.object({
        shortName: z.object({ type: z.literal('choice'), choice: z.string() }),
    }),
});

export const getProductShortName = async ({
    marketplaceId,
    asin,
    title,
    thumbnail,
    signal,
}: {
    marketplaceId: string;
    asin: string;
    title: string | null;
    thumbnail: ProductThumbnail;
    signal?: AbortSignal;
}): Promise<string | null> => {
    if (!title?.trim() || thumbnail.status !== 'available') {
        return null;
    }
    const candidates = buildShortNameCandidates(title);
    if (candidates.length === 0) {
        return null;
    }
    const inputFingerprint = getShortNameInputFingerprint(title, thumbnail.url);
    return await coordinateRetrieval({
        key: `product-short-name:${marketplaceId}:${asin}:${inputFingerprint}`,
        signal,
        timeoutMs: CALLER_TIMEOUT_MS,
        retryMessage: 'Product short name is temporarily unavailable. Retry shortly.',
        work: () =>
            resolveShortName({
                marketplaceId,
                asin,
                title,
                imageUrl: thumbnail.url,
                candidates,
                inputFingerprint,
            }),
    });
};

export const getShortNameInputFingerprint = (title: string, imageUrl: string) =>
    createHash('md5')
        .update(
            `${Buffer.byteLength(title, 'utf8')}:${title}${Buffer.byteLength(imageUrl, 'utf8')}:${imageUrl}${SHORT_NAME_GENERATOR_VERSION}`
        )
        .digest('hex');

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
                    },
                    questions: {
                        shortName: {
                            type: 'choice',
                            instructions:
                                'Choose the shortest candidate that accurately names the visible printed design. `printedText` and `visualMotifs` are observations from the image. The listing title may contain SEO phrases or alternate slogans that are not on the design. When readable text is printed, favor its distinctive words over title-only marketing terms. Include a pictured motif only if needed to recognize the design. Select NONE if no candidate fits the image evidence.',
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
    return selected;
};

interface ShortNameRequest {
    marketplaceId: string;
    asin: string;
    title: string;
    imageUrl: string;
    candidates: string[];
    inputFingerprint: string;
}

const resolveShortName = async (request: ShortNameRequest): Promise<string | null> => {
    const { marketplaceId, asin, title, imageUrl, inputFingerprint } = request;
    const identity = { marketplaceId, asin };
    while (true) {
        if (!(await isCurrentShortNameInput({ ...identity, title, imageUrl }))) {
            return null;
        }
        const stored = await getStoredShortName(identity);
        if (stored?.inputFingerprint === inputFingerprint && stored.state === 'ready') {
            return stored.shortName;
        }
        if (
            stored?.inputFingerprint === inputFingerprint &&
            stored.state === 'error' &&
            Date.now() - stored.attemptedAt.getTime() < SHORT_NAME_ERROR_RETRY_MS
        ) {
            throw shortNameUnavailable();
        }
        if (!(env.RANKWRANGLER_GEMINI_API_KEY && env.RANKWRANGLER_TYPESAFE_API_KEY)) {
            throw new Error('Product short-name providers are not configured.');
        }

        const claimId = randomUUID();
        if (await claimShortNameGeneration({ ...identity, inputFingerprint, claimId })) {
            const result = await generateClaimedShortName(request, claimId);
            if (result.kind === 'ready') {
                return result.shortName;
            }
        } else {
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
    } catch {
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
        throw shortNameUnavailable();
    }
};

const shortNameUnavailable = () =>
    new RetrievalRetryableError('Product short name is temporarily unavailable.');
