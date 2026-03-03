import { describe, expect, it } from 'bun:test';
import { estimateProductFacetClassificationCost } from '@/services/product-facet-cost.js';

describe('estimateProductFacetClassificationCost', () => {
    it('applies discounted rate for cached tokens', () => {
        const totalCost = estimateProductFacetClassificationCost({
            inputTokens: 2_000,
            cachedInputTokens: 1_000,
            outputTokens: 500,
        });

        expect(totalCost).toBeCloseTo(0.00031, 8);
    });

    it('never bills negative non-cached input tokens', () => {
        const totalCost = estimateProductFacetClassificationCost({
            inputTokens: 100,
            cachedInputTokens: 500,
            outputTokens: 0,
        });

        expect(totalCost).toBeCloseTo(0.000005, 8);
    });
});
