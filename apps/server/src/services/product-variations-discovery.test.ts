import { afterEach, describe, expect, it } from 'bun:test';
import {
    clearVariationDiscoveryCachesForTests,
    discoveryErrorCacheSizeForTests,
    pruneDiscoveryErrorCacheForTests,
    rememberDiscoveryErrorForTests,
    VARIATIONS_DISCOVERY_ERROR_CACHE_MAX,
    VARIATIONS_DISCOVERY_ERROR_COOLDOWN_MS,
} from './product-variations-discovery';

describe('variation discovery error cache', () => {
    afterEach(() => {
        clearVariationDiscoveryCachesForTests();
    });

    it('prunes expired discovery errors and evicts oldest entries at the size cap', () => {
        const now = Date.now();
        rememberDiscoveryErrorForTests('old:1', now - 1);
        rememberDiscoveryErrorForTests('live:1', now + VARIATIONS_DISCOVERY_ERROR_COOLDOWN_MS);
        pruneDiscoveryErrorCacheForTests(now);
        expect(discoveryErrorCacheSizeForTests()).toBe(1);

        clearVariationDiscoveryCachesForTests();
        for (let index = 0; index < VARIATIONS_DISCOVERY_ERROR_CACHE_MAX + 5; index += 1) {
            rememberDiscoveryErrorForTests(
                `cap:${index}`,
                now + VARIATIONS_DISCOVERY_ERROR_COOLDOWN_MS
            );
        }
        expect(discoveryErrorCacheSizeForTests()).toBe(VARIATIONS_DISCOVERY_ERROR_CACHE_MAX);
    });
});
