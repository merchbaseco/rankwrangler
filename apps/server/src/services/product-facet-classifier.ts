import { env } from '@/config/env.js';
import { PRODUCT_FACET_CLASSIFIER_PROMPT } from '@/services/product-facet-prompt.js';
import {
    type ProductFacetClassification,
    productFacetClassificationSchema,
} from '@/services/product-facet-taxonomy.js';

const GEMINI_MODEL = 'gemini-2.5-flash-lite-preview-09-2025';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const JSON_CODE_FENCE_RE = /^```(?:json)?\s*([\s\S]*?)\s*```$/i;
const IMAGE_FETCH_TIMEOUT_MS = 5000;
const IMAGE_MAX_BYTES = 2_000_000;
const AMAZON_IMAGE_HOST_RE = /^images-[a-z]+\.ssl-images-amazon\.com$/u;

export type ProductFacetClassifierUsage = {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cachedInputTokens: number;
};

export type ProductFacetClassifierResult = {
    classification: ProductFacetClassification;
    usage: ProductFacetClassifierUsage;
    rawText: string;
};

export const classifyProductFacets = async ({
    brand,
    bullet1,
    bullet2,
    thumbnailUrl,
    title,
    fetcher = fetch,
}: {
    brand: string | null;
    bullet1: string | null;
    bullet2: string | null;
    thumbnailUrl: string | null;
    title: string | null;
    fetcher?: typeof fetch;
}): Promise<ProductFacetClassifierResult> => {
    if (!env.RANKWRANGLER_GEMINI_API_KEY) {
        throw new Error(
            'RANKWRANGLER_GEMINI_API_KEY is required for product facet classification.'
        );
    }

    const userText = [
        `Brand: ${normalizeInputText(brand)}`,
        `Title: ${normalizeInputText(title)}`,
        `Bullet1: ${normalizeInputText(bullet1)}`,
        `Bullet2: ${normalizeInputText(bullet2)}`,
    ].join('\n');

    const imagePart = await buildImagePart(thumbnailUrl, fetcher);

    const response = await fetcher(
        `${GEMINI_ENDPOINT}?key=${encodeURIComponent(env.RANKWRANGLER_GEMINI_API_KEY)}`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                systemInstruction: {
                    parts: [{ text: PRODUCT_FACET_CLASSIFIER_PROMPT }],
                },
                contents: [
                    {
                        role: 'user',
                        parts: imagePart ? [{ text: userText }, imagePart] : [{ text: userText }],
                    },
                ],
                generationConfig: {
                    temperature: 0,
                    responseMimeType: 'application/json',
                },
            }),
        }
    );

    if (!response.ok) {
        const errorBody = await safeReadResponseText(response);
        throw new Error(`Gemini classification request failed (${response.status}): ${errorBody}`);
    }

    const payload = (await response.json()) as GeminiGenerateContentResponse;
    const rawText = extractModelText(payload).trim();
    if (!rawText) {
        throw new Error('Gemini returned an empty facet classification response.');
    }

    const parsed = parseFacetJson(rawText);
    const classification = productFacetClassificationSchema.parse(parsed);

    return {
        classification,
        rawText,
        usage: {
            inputTokens: payload.usageMetadata?.promptTokenCount ?? 0,
            outputTokens: payload.usageMetadata?.candidatesTokenCount ?? 0,
            totalTokens: payload.usageMetadata?.totalTokenCount ?? 0,
            cachedInputTokens: payload.usageMetadata?.cachedContentTokenCount ?? 0,
        },
    };
};

const parseFacetJson = (rawText: string) => {
    const unwrapped = unwrapCodeFence(rawText);
    try {
        return JSON.parse(unwrapped);
    } catch (error) {
        throw new Error(
            `Failed to parse facet classifier JSON: ${
                error instanceof Error ? error.message : String(error)
            }`
        );
    }
};

const unwrapCodeFence = (candidate: string) => {
    const trimmed = candidate.trim();
    if (!trimmed.startsWith('```')) {
        return trimmed;
    }

    const fenceMatch = trimmed.match(JSON_CODE_FENCE_RE);
    if (fenceMatch?.[1]) {
        return fenceMatch[1];
    }

    return trimmed
        .replace(/^```(?:json)?/i, '')
        .replace(/```$/, '')
        .trim();
};

const extractModelText = (payload: GeminiGenerateContentResponse) => {
    const parts = payload.candidates?.[0]?.content?.parts ?? [];
    return parts
        .map(part => part.text ?? '')
        .join('\n')
        .trim();
};

const normalizeInputText = (value: string | null) => {
    const trimmed = value?.trim() ?? '';
    return trimmed.length > 0 ? trimmed : 'N/A';
};

const buildImagePart = async (thumbnailUrl: string | null, fetcher: typeof fetch) => {
    if (!thumbnailUrl) {
        return null;
    }

    let url: URL;
    try {
        url = new URL(thumbnailUrl);
    } catch {
        return null;
    }
    if (url.protocol !== 'https:' || !isAllowedImageHost(url.hostname)) {
        return null;
    }

    try {
        const response = await fetcher(url, {
            redirect: 'error',
            signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS),
        });
        if (!response.ok) {
            return null;
        }

        const mimeType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
        if (!mimeType?.startsWith('image/')) {
            return null;
        }

        const reader = response.body?.getReader();
        if (!reader) {
            return null;
        }

        const chunks: Uint8Array[] = [];
        let totalBytes = 0;
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }
            totalBytes += value.byteLength;
            if (totalBytes > IMAGE_MAX_BYTES) {
                await reader.cancel();
                return null;
            }
            chunks.push(value);
        }

        if (totalBytes === 0) {
            return null;
        }

        return {
            inlineData: {
                mimeType,
                data: Buffer.concat(chunks).toString('base64'),
            },
        };
    } catch {
        return null;
    }
};

const isAllowedImageHost = (hostname: string) =>
    hostname === 'm.media-amazon.com' || AMAZON_IMAGE_HOST_RE.test(hostname);

const safeReadResponseText = async (response: Response) => {
    try {
        return await response.text();
    } catch {
        return 'Unable to read response body';
    }
};

type GeminiGenerateContentResponse = {
    candidates?: Array<{
        content?: {
            parts?: Array<{
                text?: string;
            }>;
        };
    }>;
    usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
        cachedContentTokenCount?: number;
    };
};
