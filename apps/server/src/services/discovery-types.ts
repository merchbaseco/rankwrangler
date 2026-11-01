// `adsRecommendation` evidence is no longer produced; it remains on keywords that the retired
// Amazon Ads product mining registered.
export type DiscoverySource =
    | 'interest'
    | 'brandAnalytics'
    | 'adsRecommendation'
    | 'autocomplete'
    | 'prefixAutocomplete'
    | 'legacy';

export type DiscoveryScope =
    | { kind: 'keyword'; term: string }
    | { kind: 'brand'; term: 'shirt'; brandName: string };

// Background Catalog work stops while automatic sync is paused. The Catalog limiter throws this
// in place of the request; callers keep their place and try again once sync resumes.
export class SyncPausedError extends Error {
    constructor() {
        super('Automatic sync is paused');
        this.name = 'SyncPausedError';
    }
}
