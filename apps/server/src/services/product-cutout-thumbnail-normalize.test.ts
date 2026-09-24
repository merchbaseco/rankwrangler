import { describe, expect, it } from 'bun:test';
import sharp from 'sharp';
import { normalizeCutoutThumbnail } from './product-cutout-thumbnail-normalize';

describe('normalizeCutoutThumbnail', () => {
    it.each([
        { width: 80, height: 20 },
        { width: 20, height: 80 },
    ])('centers a $width by $height subject on a full-size square', async ({ width, height }) => {
        const input = await createFixture(width, height);
        const output = await normalizeCutoutThumbnail(input);
        const { data, info } = await sharp(output).ensureAlpha().raw().toBuffer({
            resolveWithObject: true,
        });
        expect([info.width, info.height, info.channels]).toEqual([128, 128, 4]);

        let left = 128;
        let right = -1;
        let top = 128;
        let bottom = -1;
        for (let y = 0; y < info.height; y++) {
            for (let x = 0; x < info.width; x++) {
                if (data[(y * info.width + x) * info.channels + 3] <= 8) {
                    continue;
                }
                left = Math.min(left, x);
                right = Math.max(right, x);
                top = Math.min(top, y);
                bottom = Math.max(bottom, y);
            }
        }
        expect(Math.max(right - left + 1, bottom - top + 1)).toBe(128);
        expect(Math.abs(left - (127 - right))).toBeLessThanOrEqual(1);
        expect(Math.abs(top - (127 - bottom))).toBeLessThanOrEqual(1);
    });

    it('rejects a fully transparent image', async () => {
        const input = await sharp({
            create: {
                width: 32,
                height: 32,
                channels: 4,
                background: { r: 0, g: 0, b: 0, alpha: 0 },
            },
        })
            .webp()
            .toBuffer();
        await expect(normalizeCutoutThumbnail(input)).rejects.toThrow('no visible subject');
    });
});

const createFixture = async (subjectWidth: number, subjectHeight: number) => {
    const pixels = Buffer.alloc(100 * 100 * 4);
    const left = 5;
    const top = 9;
    for (let y = top; y < top + subjectHeight; y++) {
        for (let x = left; x < left + subjectWidth; x++) {
            const offset = (y * 100 + x) * 4;
            pixels[offset] = 220;
            pixels[offset + 1] = 30;
            pixels[offset + 2] = 30;
            pixels[offset + 3] = 255;
        }
    }
    return await sharp(pixels, { raw: { width: 100, height: 100, channels: 4 } })
        .webp({ lossless: true })
        .toBuffer();
};
