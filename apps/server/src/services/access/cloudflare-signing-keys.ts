import { createPublicKey, type KeyObject } from 'node:crypto';
import { CloudflareAssertionError } from '@merchbaseco/access';

const REFRESH_MS = 5 * 60_000;
const UNKNOWN_KEY_COOLDOWN_MS = 30_000;
const REQUEST_TIMEOUT_MS = 2_000;
const MAX_KEY_SET_BYTES = 65_536;
const MAX_KEYS = 32;

type SigningKeys = { fetchedAt: number; byKid: Map<string, KeyObject> };

/**
 * Cloudflare Access signing keys for assertion verification, kept warm. The access package's own
 * resolver fetches the key set in line whenever its five-minute cache lapses, so the first
 * request after a lull waited on Cloudflare. Here the set is fetched once (`warm` at startup),
 * refreshed in the background after five minutes while the current keys keep verifying, and
 * fetched in line only when an assertion names a key the set lacks, at most every 30 seconds.
 */
export const createCloudflareSigningKeys = ({
    issuer,
    fetchKeySet = () => fetchCloudflareKeySet(issuer),
    now = Date.now,
}: {
    issuer: string;
    fetchKeySet?: () => Promise<unknown>;
    now?: () => number;
}) => {
    let current: SigningKeys | null = null;
    let loading: Promise<SigningKeys> | null = null;
    const load = () => {
        loading ??= fetchKeySet()
            .then(keySet => {
                current = { fetchedAt: now(), byKid: parseKeySet(keySet) };
                return current;
            })
            .catch(() => {
                throw new CloudflareAssertionError('unavailable');
            })
            .finally(() => {
                loading = null;
            });
        return loading;
    };
    const resolve = async (header: { kid?: string }) => {
        if (!header.kid) throw new CloudflareAssertionError('unauthenticated');
        let keys = current ?? (await load());
        if (now() - keys.fetchedAt >= REFRESH_MS) load().catch(() => undefined);
        if (!keys.byKid.has(header.kid) && now() - keys.fetchedAt >= UNKNOWN_KEY_COOLDOWN_MS) {
            keys = await load();
        }
        const key = keys.byKid.get(header.kid);
        if (!key) throw new CloudflareAssertionError('unauthenticated');
        return key;
    };
    return { resolve, warm: () => load().then(() => undefined) };
};

const fetchCloudflareKeySet = async (issuer: string) => {
    const response = await fetch(`${issuer}/cdn-cgi/access/certs`, {
        redirect: 'manual',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Cloudflare signing keys returned ${response.status}`);
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_KEY_SET_BYTES) {
        throw new Error('Cloudflare signing key set is too large');
    }
    return JSON.parse(text) as unknown;
};

/** RS256 signing keys by key id; anything else in the set is ignored. */
const parseKeySet = (keySet: unknown) => {
    const keys = (keySet as { keys?: unknown })?.keys;
    if (!Array.isArray(keys) || keys.length > MAX_KEYS) {
        throw new Error('Cloudflare signing key set is malformed');
    }
    const byKid = new Map<string, KeyObject>();
    for (const jwk of keys as Array<Record<string, unknown>>) {
        if (jwk.kty !== 'RSA' || typeof jwk.kid !== 'string') continue;
        if (jwk.use !== undefined && jwk.use !== 'sig') continue;
        if (jwk.alg !== undefined && jwk.alg !== 'RS256') continue;
        const key = { kty: 'RSA', n: String(jwk.n), e: String(jwk.e) };
        byKid.set(jwk.kid, createPublicKey({ key, format: 'jwk' }));
    }
    return byKid;
};
