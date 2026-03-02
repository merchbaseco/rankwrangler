import { describe, expect, it } from 'bun:test';
import { aggregateBaKeywordRows, classifyMerchKeyword } from '@/services/spapi/ba-keywords-aggregation.js';

describe('classifyMerchKeyword', () => {
    it('returns merch relevant only when apparel intent is present', () => {
        expect(classifyMerchKeyword('st patricks day shirt').isMerchRelevant).toBe(true);
        expect(classifyMerchKeyword('st patricks day').isMerchRelevant).toBe(false);
    });

    it('returns detailed reason for seasonal + apparel keywords', () => {
        const result = classifyMerchKeyword('womens valentines day sweatshirt');

        expect(result.isMerchRelevant).toBe(true);
        expect(result.merchReason).toContain('seasonal:valentine');
        expect(result.merchReason).toContain('apparel:sweatshirt');
    });
});

describe('aggregateBaKeywordRows', () => {
    it('aggregates top-click rows into one keyword row', () => {
        const rows = aggregateBaKeywordRows([
            {
                clickShare: 0.0187,
                conversionShare: 0.0172,
                searchFrequencyRank: 98774,
                searchTerm: 'st patricks day shirt',
            },
            {
                clickShare: 0.0149,
                conversionShare: 0,
                searchFrequencyRank: 98774,
                searchTerm: 'st patricks day shirt',
            },
            {
                clickShare: 0.0135,
                conversionShare: 0,
                searchFrequencyRank: 98774,
                searchTerm: 'st patricks day shirt',
            },
        ]);

        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            clickShareTop3Sum: 0.0471,
            conversionShareTop3Sum: 0.0172,
            searchFrequencyRank: 98774,
            searchTerm: 'st patricks day shirt',
            topRowsCount: 3,
        });
    });

    it('filters out non-merch keywords', () => {
        const rows = aggregateBaKeywordRows([
            {
                clickShare: 0.2,
                conversionShare: 0.1,
                searchFrequencyRank: 1,
                searchTerm: 'tinnitus relief for ringing ears',
            },
            {
                clickShare: 0.1,
                conversionShare: 0.05,
                searchFrequencyRank: 2,
                searchTerm: 'valentines day shirt',
            },
        ]);

        expect(rows).toHaveLength(1);
        expect(rows[0]?.searchTerm).toBe('valentines day shirt');
    });
});
