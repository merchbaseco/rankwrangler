import { z } from 'zod';
import { env } from '@/config/env';
import { captureProviderAttempt } from '@/services/providers/provider-telemetry';

const GEMINI_MODEL = 'gemini-3.1-flash-lite';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const IMAGE_FETCH_TIMEOUT_MS = 5000;
const GEMINI_TIMEOUT_MS = 10_000;
const IMAGE_MAX_BYTES = 2_000_000;
const AMAZON_IMAGE_HOST_RE = /^images-[a-z]+\.ssl-images-amazon\.com$/u;
const imageObservationSchema = z.object({
    visibleText: z.string().nullable(),
    visualMotifs: z.array(z.string()).max(20),
    shortDesignName: z.string().nullable(),
    confidence: z.enum(['high', 'medium', 'low']),
});

export type ProductDesignObservation = z.infer<typeof imageObservationSchema>;

const prompt =
    'Inspect only the artwork printed on this garment. Return a compact JSON object with visibleText (exact transcription or null if unreadable), visualMotifs (short array of specific recognizable objects and their arrangement), shortDesignName (the natural 1–7 word name for the visible design, or null if unclear), and confidence (high, medium, or low). Describe decorative elements precisely enough to distinguish this design from others with the same printed words; identify linked charms or bracelet-like strands when visible rather than calling them generic garlands. Do not name the shirt, color, recipient, or product category. Do not guess words or objects you cannot see. No listing title is provided.';

export const observeProductDesign = async (
    thumbnailUrl: string,
    fetcher: typeof fetch = fetch,
    capture: typeof captureProviderAttempt = captureProviderAttempt
) => {
    if (!env.RANKWRANGLER_GEMINI_API_KEY) {
        throw new Error('RANKWRANGLER_GEMINI_API_KEY is required for Product short names.');
    }

    const imagePart = await fetchImagePart(thumbnailUrl, fetcher);
    if (!imagePart) {
        return null;
    }

    const response = await capture(
        { provider: 'gemini', operation: 'gemini.productDesign.observe' },
        () =>
            fetcher(GEMINI_ENDPOINT, {
                method: 'POST',
                headers: {
                    'x-goog-api-key': env.RANKWRANGLER_GEMINI_API_KEY,
                    'content-type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{ role: 'user', parts: [{ text: prompt }, imagePart] }],
                    generationConfig: {
                        temperature: 0,
                        responseMimeType: 'application/json',
                        thinkingConfig: { thinkingLevel: 'minimal' },
                    },
                }),
                signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
            })
    );
    if (!response.ok) {
        throw new Error(`Gemini Product design observation failed (${response.status}).`);
    }

    const payload = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = payload.candidates?.[0]?.content?.parts?.map(part => part.text ?? '').join('');
    if (!text) {
        throw new Error('Gemini returned no Product design observation.');
    }
    return imageObservationSchema.parse(JSON.parse(text));
};

const fetchImagePart = async (thumbnailUrl: string, fetcher: typeof fetch) => {
    let url: URL;
    try {
        url = new URL(thumbnailUrl);
    } catch {
        return null;
    }
    if (url.protocol !== 'https:' || !isAmazonImageHost(url.hostname)) {
        return null;
    }

    const response = await fetcher(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
        throw new Error(`Product image fetch failed (${response.status}).`);
    }

    const mimeType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
    if (mimeType !== 'image/jpeg' && mimeType !== 'image/png' && mimeType !== 'image/webp') {
        throw new Error('Product image response has an unsupported content type.');
    }
    if (Number(response.headers.get('content-length')) > IMAGE_MAX_BYTES) {
        throw new Error('Product image exceeds the observation size limit.');
    }

    const reader = response.body?.getReader();
    if (!reader) {
        throw new Error('Product image response has no body.');
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
            throw new Error('Product image exceeds the observation size limit.');
        }
        chunks.push(value);
    }
    if (totalBytes === 0) {
        throw new Error('Product image response is empty.');
    }

    return {
        inlineData: { mimeType, data: Buffer.concat(chunks).toString('base64') },
        mediaResolution: { level: 'media_resolution_low' },
    };
};

const isAmazonImageHost = (hostname: string) =>
    hostname === 'm.media-amazon.com' || AMAZON_IMAGE_HOST_RE.test(hostname);
