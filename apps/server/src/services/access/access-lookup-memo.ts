import type { AccessProjectionStore } from '@merchbaseco/access';

/** How long an identity lookup is reused; projection writes through `apply` clear it at once. */
export const IDENTITY_LOOKUP_MS = 30_000;
const MAX_ENTRIES = 1_000;

type IdentityLookup = Awaited<ReturnType<AccessProjectionStore['findByIdentity']>>;

/**
 * Every authorized request reads two projections (the identity binding and the user's grant), each
 * a database round trip. This reuses a lookup for IDENTITY_LOOKUP_MS. Projections change through
 * `apply` (snapshot delivery, reconcile, repair), which clears every memoized lookup, so only a
 * write from outside this process waits out the window. Grant expiry is still checked against the
 * clock on every request, since callers evaluate `accessValidUntil` themselves.
 */
export const memoizeIdentityLookups = (
    store: AccessProjectionStore,
    now: () => number = Date.now
): AccessProjectionStore => {
    const lookups = new Map<string, { expiresAt: number; value: Promise<IdentityLookup> }>();
    return {
        apply: async event => {
            lookups.clear();
            try {
                return await store.apply(event);
            } finally {
                lookups.clear();
            }
        },
        findByIdentity: identity => {
            const key = `${identity.issuer}\u0000${identity.subject}`;
            const cached = lookups.get(key);
            if (cached && cached.expiresAt > now()) return cached.value;
            const value = store.findByIdentity(identity);
            const entry = { expiresAt: now() + IDENTITY_LOOKUP_MS, value };
            lookups.delete(key);
            lookups.set(key, entry);
            value.catch(() => {
                if (lookups.get(key) === entry) lookups.delete(key);
            });
            while (lookups.size > MAX_ENTRIES) {
                const oldest = lookups.keys().next().value;
                if (oldest === undefined) break;
                lookups.delete(oldest);
            }
            return value;
        },
        findByMerchbaseUserId: merchbaseUserId => store.findByMerchbaseUserId(merchbaseUserId),
    };
};

/**
 * A Merchbase user's RankWrangler service account never changes once created, so its resolution
 * is kept for the life of the process instead of read on every request.
 */
export const memoizePrincipals = <T>(
    resolve: (input: { merchbaseUserId: string }) => Promise<T>
) => {
    const principals = new Map<string, Promise<T>>();
    return (input: { merchbaseUserId: string }) => {
        const cached = principals.get(input.merchbaseUserId);
        if (cached) return cached;
        const value = resolve(input);
        principals.set(input.merchbaseUserId, value);
        value.catch(() => {
            if (principals.get(input.merchbaseUserId) === value) {
                principals.delete(input.merchbaseUserId);
            }
        });
        if (principals.size > MAX_ENTRIES) {
            const oldest = principals.keys().next().value;
            if (oldest !== undefined) principals.delete(oldest);
        }
        return value;
    };
};
