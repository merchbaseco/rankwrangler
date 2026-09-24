import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { env } from '@/config/env';
import { normalizeCutoutThumbnail } from './product-cutout-thumbnail-normalize';
import { captureProviderAttempt } from './providers/provider-telemetry';

const IMAGE_MAX_BYTES = 512_000;
const TRANSFORM_TIMEOUT_MS = 20_000;
const AMAZON_IMAGE_HOST_RE = /^images-[a-z]+\.ssl-images-amazon\.com$/u;
const TRANSFORM_OPTIONS =
    'width=512,height=512,fit=contain,format=webp,quality=90,segment=foreground';

export const isCutoutSourceSupported = (sourceUrl: string) => {
    try {
        const url = new URL(sourceUrl);
        return (
            url.protocol === 'https:' &&
            (url.hostname === 'm.media-amazon.com' || AMAZON_IMAGE_HOST_RE.test(url.hostname))
        );
    } catch {
        return false;
    }
};

export const createCutoutObject = async ({
    sourceUrl,
    objectKey,
    fetcher = fetch,
    createClient = () =>
        new S3Client({
            region: 'auto',
            endpoint: `https://${env.RANKWRANGLER_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
            credentials: {
                accessKeyId: env.RANKWRANGLER_R2_ACCESS_KEY_ID ?? '',
                secretAccessKey: env.RANKWRANGLER_R2_SECRET_ACCESS_KEY ?? '',
            },
        }),
}: {
    sourceUrl: string;
    objectKey: string;
    fetcher?: typeof fetch;
    createClient?: () => S3Client;
}) => {
    if (!isCutoutSourceSupported(sourceUrl)) {
        throw new Error('Unsupported Product cutout source image URL.');
    }
    if (!(env.RANKWRANGLER_R2_ACCESS_KEY_ID && env.RANKWRANGLER_R2_SECRET_ACCESS_KEY)) {
        throw new Error('Product cutout R2 credentials are not configured.');
    }

    const transformUrl = new URL(
        `/cdn-cgi/image/${TRANSFORM_OPTIONS}/${sourceUrl}`,
        env.RANKWRANGLER_CUTOUT_TRANSFORM_ORIGIN
    );
    const response = await captureProviderAttempt(
        { provider: 'cloudflare', operation: 'cloudflare.cutout.transform' },
        () =>
            fetcher(transformUrl, {
                redirect: 'error',
                headers: { Accept: 'image/webp' },
                signal: AbortSignal.timeout(TRANSFORM_TIMEOUT_MS),
            })
    );
    if (!response.ok) {
        throw new Error(`Product cutout transformation failed (${response.status}).`);
    }
    if (response.headers.get('content-type')?.split(';')[0]?.trim() !== 'image/webp') {
        throw new Error('Product cutout transformation did not return WebP.');
    }
    if (Number(response.headers.get('content-length')) > IMAGE_MAX_BYTES) {
        throw new Error('Product cutout transformation exceeded the size limit.');
    }
    const reader = response.body?.getReader();
    if (!reader) {
        throw new Error('Product cutout transformation returned an empty body.');
    }
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }
            totalBytes += value.byteLength;
            if (totalBytes > IMAGE_MAX_BYTES) {
                throw new Error('Product cutout transformation exceeded the size limit.');
            }
            chunks.push(value);
        }
    } catch (error) {
        await reader.cancel().catch(() => undefined);
        throw error;
    } finally {
        reader.releaseLock();
    }
    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    if (
        bytes.byteLength === 0 ||
        bytes.byteLength > IMAGE_MAX_BYTES ||
        new TextDecoder().decode(bytes.subarray(0, 4)) !== 'RIFF' ||
        new TextDecoder().decode(bytes.subarray(8, 12)) !== 'WEBP'
    ) {
        throw new Error('Product cutout transformation returned invalid or oversized WebP.');
    }

    const thumbnail = await normalizeCutoutThumbnail(bytes);
    if (thumbnail.byteLength > IMAGE_MAX_BYTES) {
        throw new Error('Product cutout normalized thumbnail exceeded the size limit.');
    }

    const client = createClient();
    try {
        await captureProviderAttempt(
            { provider: 'cloudflare', operation: 'cloudflare.r2.put' },
            () =>
                client.send(
                    new PutObjectCommand({
                        Bucket: env.RANKWRANGLER_R2_BUCKET_NAME,
                        Key: objectKey,
                        Body: thumbnail,
                        ContentType: 'image/webp',
                        CacheControl: 'public, max-age=31536000, immutable',
                    })
                )
        );
    } finally {
        client.destroy();
    }
    return thumbnail.byteLength;
};

export const getCutoutPublicUrl = (objectKey: string) =>
    new URL(objectKey, `${env.RANKWRANGLER_CUTOUT_PUBLIC_ORIGIN}/`).toString();
