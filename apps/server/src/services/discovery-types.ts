export type DiscoverySource =
    | 'interest'
    | 'brandAnalytics'
    | 'adsRecommendation'
    | 'autocomplete'
    | 'legacy';

export type DiscoveryScope =
    | { kind: 'keyword'; term: string }
    | { kind: 'brand'; term: 'shirt'; brandName: string };

export class CatalogCapacityDeferredError extends Error {
    constructor(
        readonly reason: 'rate' | 'protectedWork' | 'cooldown' | 'paused',
        readonly retryAt: Date
    ) {
        super(`Catalog capacity deferred: ${reason}`);
        this.name = 'CatalogCapacityDeferredError';
    }
}
