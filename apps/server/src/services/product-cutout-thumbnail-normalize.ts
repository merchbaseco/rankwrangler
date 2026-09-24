import sharp from 'sharp';

const THUMBNAIL_SIZE = 128;
const VISIBLE_ALPHA_THRESHOLD = 8;

export const normalizeCutoutThumbnail = async (input: Uint8Array): Promise<Buffer> => {
    const image = Buffer.from(input);
    const { data, info } = await sharp(image).ensureAlpha().raw().toBuffer({
        resolveWithObject: true,
    });
    if (info.channels !== 4) {
        throw new Error('Product cutout could not be decoded as RGBA.');
    }

    let left = info.width;
    let top = info.height;
    let right = -1;
    let bottom = -1;
    for (let y = 0; y < info.height; y++) {
        for (let x = 0; x < info.width; x++) {
            if (data[(y * info.width + x) * info.channels + 3] <= VISIBLE_ALPHA_THRESHOLD) {
                continue;
            }
            left = Math.min(left, x);
            top = Math.min(top, y);
            right = Math.max(right, x);
            bottom = Math.max(bottom, y);
        }
    }
    if (right < left || bottom < top) {
        throw new Error('Product cutout has no visible subject.');
    }

    return await sharp(image)
        .extract({ left, top, width: right - left + 1, height: bottom - top + 1 })
        .resize({
            width: THUMBNAIL_SIZE,
            height: THUMBNAIL_SIZE,
            fit: 'contain',
            position: 'centre',
            background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .webp({ quality: 85 })
        .toBuffer();
};
