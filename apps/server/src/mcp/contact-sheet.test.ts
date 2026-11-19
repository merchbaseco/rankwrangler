import { describe, expect, it, mock } from 'bun:test';
import sharp from 'sharp';
import { buildContactSheet } from './contact-sheet-images';

const AMAZON_URL = 'https://m.media-amazon.com/images/I/red.jpg';
const BROKEN_URL = 'https://m.media-amazon.com/images/I/broken.jpg';

describe('MCP contact sheet', () => {
    it('lays out images in order with index badges and grey cells for missing images', async () => {
        const red = await sharp({
            create: { width: 400, height: 400, channels: 3, background: { r: 220, g: 0, b: 0 } },
        })
            .png()
            .toBuffer();
        const fetchImage = mock(async (url: string, _signal: AbortSignal) => {
            if (url === BROKEN_URL) throw new Error('timed out');
            return red;
        });

        const sheet = await buildContactSheet(
            [AMAZON_URL, BROKEN_URL, null, 'https://evil.example/red.jpg'],
            fetchImage
        );

        expect(sheet?.mimeType).toBe('image/jpeg');
        expect(fetchImage.mock.calls.map(([url]: readonly unknown[]) => url)).toEqual([
            AMAZON_URL,
            BROKEN_URL,
        ]);
        const image = sharp(Buffer.from(sheet?.data ?? '', 'base64'));
        const { width, height, format } = await image.metadata();
        // Four images: a 2 x 2 grid of 320px cells with 6px gaps.
        expect({ width, height, format }).toEqual({ width: 658, height: 658, format: 'jpeg' });
        const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
        const pixel = (x: number, y: number) => {
            const offset = (y * info.width + x) * info.channels;
            return [data[offset], data[offset + 1], data[offset + 2]];
        };
        const near = (actual: Array<number | undefined>, expected: number[]) =>
            actual.every((value, index) => Math.abs((value ?? -999) - (expected[index] ?? 0)) < 24);
        // Cell 1 is the red image; its badge sits dark in the top-left corner.
        expect(near(pixel(200, 200), [220, 0, 0])).toBe(true);
        expect(near(pixel(8, 8), [17, 17, 17])).toBe(true);
        // The "1" is a white upright stroke inside the badge.
        expect(near(pixel(46, 30), [255, 255, 255])).toBe(true);
        // Cell 2 failed, cell 3 had no image, cell 4 was off the allowlist: all grey.
        expect(near(pixel(480, 200), [200, 200, 200])).toBe(true);
        expect(near(pixel(200, 480), [200, 200, 200])).toBe(true);
        expect(near(pixel(480, 480), [200, 200, 200])).toBe(true);
        expect(Buffer.from(sheet?.data ?? '', 'base64').length).toBeLessThanOrEqual(1_000_000);
    });

    it('returns no sheet for no items', async () => {
        expect(await buildContactSheet([], async () => null)).toBeNull();
    });
});
