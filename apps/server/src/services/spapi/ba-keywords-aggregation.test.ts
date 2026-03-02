import { describe, expect, it } from 'bun:test';
import { aggregateBaKeywordRows, classifyMerchKeyword } from '@/services/spapi/ba-keywords-aggregation.js';

describe('classifyMerchKeyword', () => {
    it('requires apparel top-clicked categories', () => {
        expect(classifyMerchKeyword('st patricks day shirt', ['apparel']).isMerchRelevant).toBe(true);
        expect(classifyMerchKeyword('st patricks day shirt', ['books']).isMerchRelevant).toBe(false);
    });

    it('accepts intent terms like gift without explicit apparel words', () => {
        const result = classifyMerchKeyword('gift for mom', ['apparel', 'tops']);

        expect(result.isMerchRelevant).toBe(true);
        expect(result.merchReason).toContain('intent:gift');
        expect(result.merchReason).toContain('category:apparel');
    });

    it('accepts school-event terms when apparel category is present', () => {
        const result = classifyMerchKeyword('100 days of school', ['apparel', 'toys']);

        expect(result.isMerchRelevant).toBe(true);
        expect(result.merchReason).toContain('intent:school');
        expect(result.merchReason).toContain('category:apparel');
    });

    it('blocks cotton commodity terms', () => {
        expect(classifyMerchKeyword('100% cotton underwear', ['apparel']).isMerchRelevant).toBe(false);
    });

    it('blocks common merch listing boilerplate commodity terms', () => {
        expect(
            classifyMerchKeyword('classic fit twill-taped neck hoodie', ['apparel']).isMerchRelevant
        ).toBe(false);
    });

    it('blocks expanded non-pod apparel style terms', () => {
        expect(classifyMerchKeyword('white button down shirt women', ['apparel']).isMerchRelevant).toBe(
            false
        );
        expect(classifyMerchKeyword('compression shirt men', ['apparel']).isMerchRelevant).toBe(false);
    });

    it('blocks brand and ip seeded terms', () => {
        expect(classifyMerchKeyword('nike hoodie', ['apparel']).isMerchRelevant).toBe(false);
        expect(classifyMerchKeyword('seahawks shirt', ['apparel']).isMerchRelevant).toBe(false);
    });

    it('blocks short generic apparel-only terms', () => {
        expect(classifyMerchKeyword('hoodie', ['apparel']).isMerchRelevant).toBe(false);
        expect(classifyMerchKeyword('mens sweatshirt', ['apparel']).isMerchRelevant).toBe(false);
    });

    it('blocks short color+gender generic apparel terms', () => {
        expect(classifyMerchKeyword('black hoodie men', ['apparel']).isMerchRelevant).toBe(false);
    });

    it('keeps seasonal terms even when they include gender tokens', () => {
        const result = classifyMerchKeyword('st patricks day shirt women', ['apparel']);

        expect(result.isMerchRelevant).toBe(true);
        expect(result.merchReason).toContain('seasonal:st patrick');
    });

    it('accepts additional product-type signals', () => {
        const result = classifyMerchKeyword('st patricks day raglan', ['apparel', 'tops']);

        expect(result.isMerchRelevant).toBe(true);
        expect(result.merchReason).toContain('category:apparel');
        expect(result.merchReason).not.toContain('apparel:');
    });

    it('returns detailed reason for seasonal + apparel keywords', () => {
        const result = classifyMerchKeyword('womens valentines day sweatshirt', ['apparel']);

        expect(result.isMerchRelevant).toBe(true);
        expect(result.merchReason).toContain('seasonal:valentine');
        expect(result.merchReason).toContain('category:apparel');
        expect(result.merchReason).not.toContain('apparel:');
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
                topClickedCategories: 'Apparel, Softlines Private Label',
            },
            {
                clickShare: 0.0149,
                conversionShare: 0,
                searchFrequencyRank: 98774,
                searchTerm: 'st patricks day shirt',
                topClickedCategories: 'Apparel, Softlines Private Label',
            },
            {
                clickShare: 0.0135,
                conversionShare: 0,
                searchFrequencyRank: 98774,
                searchTerm: 'st patricks day shirt',
                topClickedCategories: 'Apparel, Softlines Private Label',
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
                topClickedCategories: 'Health & Personal Care',
            },
            {
                clickShare: 0.1,
                conversionShare: 0.05,
                searchFrequencyRank: 2,
                searchTerm: 'gift for mom',
                topClickedCategories: 'Apparel, Tops',
            },
            {
                clickShare: 0.11,
                conversionShare: 0.03,
                searchFrequencyRank: 3,
                searchTerm: '100% cotton underwear',
                topClickedCategories: 'Apparel, Softlines',
            },
            {
                clickShare: 0.08,
                conversionShare: 0.01,
                searchFrequencyRank: 4,
                searchTerm: 'classic fit twill-taped neck hoodie',
                topClickedCategories: 'Apparel, Softlines',
            },
        ]);

        expect(rows).toHaveLength(1);
        expect(rows[0]?.searchTerm).toBe('gift for mom');
    });

    it('requires apparel in top clicked category #1 or #2', () => {
        const rows = aggregateBaKeywordRows([
            {
                clickShare: 0.2,
                conversionShare: 0.1,
                searchFrequencyRank: 1,
                searchTerm: 'gift for mom',
                'Top Clicked Category #1': 'Home',
                'Top Clicked Category #2': 'Kitchen',
                'Top Clicked Category #3': 'Apparel',
            },
            {
                clickShare: 0.2,
                conversionShare: 0.1,
                searchFrequencyRank: 2,
                searchTerm: 'gift for dad',
                'Top Clicked Category #1': 'Home',
                'Top Clicked Category #2': 'Apparel',
                'Top Clicked Category #3': 'Kitchen',
            },
        ]);

        expect(rows).toHaveLength(1);
        expect(rows[0]?.searchTerm).toBe('gift for dad');
    });

    it('does not treat product category path keys as top-category rank slots', () => {
        const rows = aggregateBaKeywordRows([
            {
                clickShare: 0.2,
                conversionShare: 0.1,
                searchFrequencyRank: 1,
                searchTerm: 'st patricks day shirt',
                topClickedCategories: 'Apparel, Softlines',
                'Top Clicked Product #1: Top Clicked Category #1': 'Books',
                'Top Clicked Product #1: Top Clicked Category #2': 'Entertainment',
            },
        ]);

        expect(rows).toHaveLength(1);
        expect(rows[0]?.searchTerm).toBe('st patricks day shirt');
    });
});
