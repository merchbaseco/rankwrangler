import { describe, expect, it, mock } from 'bun:test';
import { observeProductDesign } from './product-design-observation';
import { chooseProductShortName, getShortNameInputFingerprint } from './product-short-name';

describe('Product short-name providers', () => {
    it('invalidates a stored name when the title or image changes', () => {
        const original = getShortNameInputFingerprint(
            'Zombiecorn',
            'https://m.media-amazon.com/a.jpg'
        );
        expect(getShortNameInputFingerprint('Zombiecorn', 'https://m.media-amazon.com/a.jpg')).toBe(
            original
        );
        expect(
            getShortNameInputFingerprint('Zombiecorn Shirt', 'https://m.media-amazon.com/a.jpg')
        ).not.toBe(original);
        expect(
            getShortNameInputFingerprint('Zombiecorn', 'https://m.media-amazon.com/b.jpg')
        ).not.toBe(original);
    });
    it('sends the image without listing text at low Gemini media resolution', async () => {
        const fetcher = mock((input: string | URL | Request, init?: RequestInit) => {
            if (String(input).startsWith('https://m.media-amazon.com/')) {
                return new Response(new Uint8Array([1, 2, 3]), {
                    headers: { 'content-type': 'image/jpeg' },
                });
            }
            const request = JSON.parse(String(init?.body));
            expect(request.contents[0].parts[0].text).not.toContain('Zombiecorn Zombie Unicorn');
            expect(request.contents[0].parts[1].mediaResolution).toEqual({
                level: 'media_resolution_low',
            });
            return Response.json({
                candidates: [
                    {
                        content: {
                            parts: [
                                {
                                    text: JSON.stringify({
                                        visibleText: 'ZOMBIECORN',
                                        visualMotifs: ['zombie unicorn'],
                                        shortDesignName: 'Zombie Unicorn',
                                        confidence: 'high',
                                    }),
                                },
                            ],
                        },
                    },
                ],
            });
        });

        const observation = await observeProductDesign(
            'https://m.media-amazon.com/images/example.jpg',
            fetcher as typeof fetch,
            async (_descriptor, run) => await run()
        );

        expect(observation?.visibleText).toBe('ZOMBIECORN');
        expect(fetcher).toHaveBeenCalledTimes(2);
    });

    it('returns no observation for a non-Amazon image host', async () => {
        const fetcher = mock(async () => Response.json({}));
        expect(await observeProductDesign('https://example.com/image.jpg', fetcher)).toBeNull();
        expect(fetcher).not.toHaveBeenCalled();
    });

    it('retries a temporarily missing Amazon image instead of caching an abstention', async () => {
        const fetcher = mock(async () => new Response(null, { status: 404 }));
        await expect(
            observeProductDesign('https://m.media-amazon.com/images/example.jpg', fetcher)
        ).rejects.toThrow('Product image fetch failed (404).');
    });

    it('accepts only a declared Jev title span', async () => {
        const observation = {
            visibleText: 'JUST HERE FOR THE ROLLS',
            visualMotifs: ['turkey'],
            shortDesignName: 'Turkey with rolls',
            confidence: 'high' as const,
        };
        const candidates = ['Turkey Just Here for the Rolls', 'Just Here for the Rolls'];
        const fetcher = mock((_input: string | URL | Request, init?: RequestInit) => {
            const request = JSON.parse(String(init?.body));
            expect(request.state.printedText).toBe(observation.visibleText);
            expect(Object.keys(request.questions.shortName.criteria)).toContain(
                'Just Here for the Rolls'
            );
            return Response.json({
                answers: { shortName: { type: 'choice', choice: 'Just Here for the Rolls' } },
            });
        });

        expect(
            await chooseProductShortName({
                title: 'Funny Thanksgiving Turkey Just Here for the Rolls Dinner T-Shirt',
                observation,
                candidates,
                fetcher: fetcher as typeof fetch,
                capture: async (_descriptor, run) => await run(),
            })
        ).toBe('Just Here for the Rolls');
    });
});
