// `adsRecommendation` evidence is no longer produced; it remains on keywords that the retired
// Amazon Ads product mining registered.
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
