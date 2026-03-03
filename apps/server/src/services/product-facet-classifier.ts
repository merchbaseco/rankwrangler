import { env } from '@/config/env.js';
import { PRODUCT_FACET_CLASSIFIER_PROMPT } from '@/services/product-facet-prompt.js';
import {
    productFacetClassificationSchema,
    type ProductFacetClassification,
} from '@/services/product-facet-taxonomy.js';

const GEMINI_MODEL = 'gemini-2.5-flash-lite-preview-09-2025';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const JSON_CODE_FENCE_RE = /^```(?:json)?\s*([\s\S]*?)\s*```$/i;
const IMAGE_FETCH_TIMEOUT_MS = 5000;
const IMAGE_MAX_BYTES = 2_000_000;

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
}: {
    brand: string | null;
    bullet1: string | null;
    bullet2: string | null;
    thumbnailUrl: string | null;
    title: string | null;
}): Promise<ProductFacetClassifierResult> => {
    if (!env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY is required for product facet classification.');
    }

    const userText = [
        `Brand: ${normalizeInputText(brand)}`,
        `Title: ${normalizeInputText(title)}`,
        `Bullet1: ${normalizeInputText(bullet1)}`,
        `Bullet2: ${normalizeInputText(bullet2)}`,
    ].join('\n');

    const imagePart = await buildImagePart(thumbnailUrl);

    const response = await fetch(
        `${GEMINI_ENDPOINT}?key=${encodeURIComponent(env.GEMINI_API_KEY)}`,
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
                        parts: imagePart
                            ? [{ text: userText }, imagePart]
                            : [{ text: userText }],
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
        throw new Error(
            `Gemini classification request failed (${response.status}): ${errorBody}`
        );
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

    return trimmed.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
};

const extractModelText = (payload: GeminiGenerateContentResponse) => {
    const parts = payload.candidates?.[0]?.content?.parts ?? [];
    return parts
        .map((part) => part.text ?? '')
        .join('\n')
        .trim();
};

const normalizeInputText = (value: string | null) => {
    const trimmed = value?.trim() ?? '';
    return trimmed.length > 0 ? trimmed : 'N/A';
};

const buildImagePart = async (thumbnailUrl: string | null) => {
    if (!thumbnailUrl) {
        return null;
    }

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);
        const response = await fetch(thumbnailUrl, { signal: controller.signal });
        clearTimeout(timeout);

        if (!response.ok) {
            return null;
        }

        const contentType = response.headers.get('content-type') ?? 'image/jpeg';
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.byteLength === 0 || bytes.byteLength > IMAGE_MAX_BYTES) {
            return null;
        }

        return {
            inlineData: {
                mimeType: contentType,
                data: Buffer.from(bytes).toString('base64'),
            },
        };
    } catch {
        return null;
    }
};

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
