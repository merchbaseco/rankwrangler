import { describe, expect, it, mock } from 'bun:test';
import { classifyProductFacets } from './product-facet-classifier';

const GEMINI_URL_PREFIX = 'https://generativelanguage.googleapis.com/';

const buildGeminiResponse = () =>
    Response.json({
        candidates: [
            {
                content: {
                    parts: [{ text: JSON.stringify({ profession: ['chef'] }) }],
                },
            },
        ],
        usageMetadata: {
            promptTokenCount: 10,
            candidatesTokenCount: 5,
            totalTokenCount: 15,
            cachedContentTokenCount: 0,
        },
    });

const classifyWithFetcher = (thumbnailUrl: string | null, fetcher: typeof fetch) =>
    classifyProductFacets({
        brand: 'Acme',
        bullet1: null,
        bullet2: null,
        thumbnailUrl,
        title: 'Zombiecorn Shirt',
        fetcher,
    });

describe('classifyProductFacets image fetch', () => {
    it('skips a disallowed image host without fetching it', async () => {
        const fetcher = mock((input: string | URL | Request, init?: RequestInit) => {
            expect(String(input).startsWith(GEMINI_URL_PREFIX)).toBe(true);
            const body = JSON.parse(String(init?.body));
            expect(body.contents[0].parts).toHaveLength(1);
            return buildGeminiResponse();
        });

        const result = await classifyWithFetcher('https://example.com/image.jpg', fetcher);

        expect(result.classification.profession).toEqual(['chef']);
        expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it('rejects a lookalike host with the real host appended as a suffix', async () => {
        const fetcher = mock(() => buildGeminiResponse());

        await classifyWithFetcher('https://m.media-amazon.com.evil.com/x.jpg', fetcher);

        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(String(fetcher.mock.calls[0]?.[0]).startsWith(GEMINI_URL_PREFIX)).toBe(true);
    });

    it('rejects a lookalike host with the real host embedded in the path', async () => {
        const fetcher = mock(() => buildGeminiResponse());

        await classifyWithFetcher('https://evil.com/m.media-amazon.com/x.jpg', fetcher);

        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(String(fetcher.mock.calls[0]?.[0]).startsWith(GEMINI_URL_PREFIX)).toBe(true);
    });

    it('treats a redirect from an allowed host as a fetch failure', async () => {
        const fetcher = mock((input: string | URL | Request, init?: RequestInit) => {
            if (String(input).startsWith('https://m.media-amazon.com/')) {
                return Promise.reject(new TypeError('fetch failed'));
            }
            const body = JSON.parse(String(init?.body));
            expect(body.contents[0].parts).toHaveLength(1);
            return buildGeminiResponse();
        });

        const result = await classifyWithFetcher(
            'https://m.media-amazon.com/images/example.jpg',
            fetcher
        );

        expect(result.classification.profession).toEqual(['chef']);
        expect(fetcher).toHaveBeenCalledTimes(2);
    });

    it('aborts an oversized image stream from an allowed host', async () => {
        const chunkSize = 1_000_000;
        const fetcher = mock((input: string | URL | Request, init?: RequestInit) => {
            if (String(input).startsWith('https://m.media-amazon.com/')) {
                const stream = new ReadableStream<Uint8Array>({
                    start(controller) {
                        controller.enqueue(new Uint8Array(chunkSize));
                        controller.enqueue(new Uint8Array(chunkSize));
                        controller.enqueue(new Uint8Array(chunkSize));
                        controller.close();
                    },
                });
                return new Response(stream, {
                    headers: { 'content-type': 'image/jpeg' },
                });
            }
            const body = JSON.parse(String(init?.body));
            expect(body.contents[0].parts).toHaveLength(1);
            return buildGeminiResponse();
        });

        const result = await classifyWithFetcher(
            'https://m.media-amazon.com/images/example.jpg',
            fetcher
        );

        expect(result.classification.profession).toEqual(['chef']);
    });

    it('rejects a non-image content type from an allowed host', async () => {
        const fetcher = mock((input: string | URL | Request, init?: RequestInit) => {
            if (String(input).startsWith('https://m.media-amazon.com/')) {
                return new Response('<html></html>', {
                    headers: { 'content-type': 'text/html' },
                });
            }
            const body = JSON.parse(String(init?.body));
            expect(body.contents[0].parts).toHaveLength(1);
            return buildGeminiResponse();
        });

        const result = await classifyWithFetcher(
            'https://m.media-amazon.com/images/example.jpg',
            fetcher
        );

        expect(result.classification.profession).toEqual(['chef']);
    });

    it('includes an allowed-host image under the size cap as inline data', async () => {
        const bytes = new Uint8Array([1, 2, 3, 4, 5]);
        const fetcher = mock((input: string | URL | Request, init?: RequestInit) => {
            if (String(input).startsWith('https://images-na.ssl-images-amazon.com/')) {
                return new Response(bytes, {
                    headers: { 'content-type': 'image/jpeg; charset=binary' },
                });
            }
            const body = JSON.parse(String(init?.body));
            const parts = body.contents[0].parts;
            expect(parts).toHaveLength(2);
            expect(parts[0].text).toContain('Zombiecorn Shirt');
            expect(parts[1].inlineData.mimeType).toBe('image/jpeg');
            expect(parts[1].inlineData.data).toBe(Buffer.from(bytes).toString('base64'));
            return buildGeminiResponse();
        });

        const result = await classifyWithFetcher(
            'https://images-na.ssl-images-amazon.com/images/example.jpg',
            fetcher
        );

        expect(result.classification.profession).toEqual(['chef']);
        expect(fetcher).toHaveBeenCalledTimes(2);
    });
});
