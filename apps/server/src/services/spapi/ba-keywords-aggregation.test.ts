import { describe, expect, it } from 'bun:test';
import { aggregateBaKeywordRows, classifyMerchKeyword } from '@/services/spapi/ba-keywords-aggregation.js';

describe('classifyMerchKeyword', () => {
    it('does not depend on top-clicked category data', () => {
        expect(classifyMerchKeyword('st patricks day shirt').isMerchRelevant).toBe(true);
    });

    it('accepts intent terms like gift without explicit apparel words', () => {
        const result = classifyMerchKeyword('gift for mom');

        expect(result.isMerchRelevant).toBe(true);
        expect(result.merchReason).toContain('intent:gift');
    });

    it('blocks stored-value card terms while keeping broad gift intent', () => {
        expect(classifyMerchKeyword('gift card').isMerchRelevant).toBe(false);
        expect(classifyMerchKeyword('apple gift cards email delivery').isMerchRelevant).toBe(false);
        expect(classifyMerchKeyword('e gift card amazon').isMerchRelevant).toBe(false);
        expect(classifyMerchKeyword('gift for mom').isMerchRelevant).toBe(true);
    });

    it('blocks card and digital-code suffix patterns', () => {
        expect(classifyMerchKeyword('valentines day card').isMerchRelevant).toBe(false);
        expect(classifyMerchKeyword('valentines cards for kids school').isMerchRelevant).toBe(false);
        expect(classifyMerchKeyword('roblox gift card digital code').isMerchRelevant).toBe(false);
    });

    it('keeps class and classroom intent when not card-specific', () => {
        expect(classifyMerchKeyword('class valentines day gifts for kids').isMerchRelevant).toBe(true);
        expect(classifyMerchKeyword('100 days of school shirt for classroom').isMerchRelevant).toBe(
            true
        );
    });

    it('blocks non-pod seasonal merchandise terms without apparel product signal', () => {
        expect(classifyMerchKeyword('st patricks day decorations').isMerchRelevant).toBe(false);
        expect(classifyMerchKeyword('valentines day candy').isMerchRelevant).toBe(false);
        expect(classifyMerchKeyword('easter basket stuffers').isMerchRelevant).toBe(false);
    });

    it('keeps seasonal terms that still include apparel product signals', () => {
        expect(classifyMerchKeyword('valentines sweater women').isMerchRelevant).toBe(true);
        expect(classifyMerchKeyword('mardi gras shirts for women').isMerchRelevant).toBe(true);
    });

    it('accepts school-event terms', () => {
        const result = classifyMerchKeyword('100 days of school');

        expect(result.isMerchRelevant).toBe(true);
        expect(result.merchReason).toContain('intent:school');
    });

    it('blocks cotton commodity terms', () => {
        expect(classifyMerchKeyword('100% cotton underwear').isMerchRelevant).toBe(false);
    });

    it('blocks common merch listing boilerplate commodity terms', () => {
        expect(classifyMerchKeyword('classic fit twill-taped neck hoodie').isMerchRelevant).toBe(false);
    });

    it('blocks expanded non-pod apparel style terms', () => {
        expect(classifyMerchKeyword('white button down shirt women').isMerchRelevant).toBe(false);
        expect(classifyMerchKeyword('compression shirt men').isMerchRelevant).toBe(false);
    });

    it('blocks brand and ip seeded terms', () => {
        expect(classifyMerchKeyword('nike hoodie').isMerchRelevant).toBe(false);
        expect(classifyMerchKeyword('seahawks shirt').isMerchRelevant).toBe(false);
        expect(classifyMerchKeyword('yeti coffee tumbler').isMerchRelevant).toBe(false);
        expect(classifyMerchKeyword('minecraft valentines').isMerchRelevant).toBe(false);
    });

    it('blocks short generic apparel-only terms', () => {
        expect(classifyMerchKeyword('hoodie').isMerchRelevant).toBe(false);
        expect(classifyMerchKeyword('mens sweatshirt').isMerchRelevant).toBe(false);
    });

    it('blocks short color+gender generic apparel terms', () => {
        expect(classifyMerchKeyword('black hoodie men').isMerchRelevant).toBe(false);
    });

    it('keeps seasonal terms even when they include gender tokens', () => {
        const result = classifyMerchKeyword('st patricks day shirt women');

        expect(result.isMerchRelevant).toBe(true);
        expect(result.merchReason).toContain('seasonal:st patrick');
    });

    it('accepts additional product-type signals', () => {
        const result = classifyMerchKeyword('st patricks day raglan');

        expect(result.isMerchRelevant).toBe(true);
        expect(result.merchReason).toContain('seasonal:st patrick');
        expect(result.merchReason).not.toContain('apparel:');
    });

    it('returns detailed reason for seasonal keywords', () => {
        const result = classifyMerchKeyword('womens valentines day sweatshirt');

        expect(result.isMerchRelevant).toBe(true);
        expect(result.merchReason).toContain('seasonal:valentine');
        expect(result.merchReason).not.toContain('apparel:');
    });

    it('uses apparel signal reason when no seasonal/intent signal matched', () => {
        const result = classifyMerchKeyword('funny nurse shirt');

        expect(result.isMerchRelevant).toBe(true);
        expect(result.merchReason).toBe('signal:apparel');
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

    it('does not require top-clicked category slots', () => {
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
                'Top Clicked Category #2': 'Kitchen',
            },
        ]);

        expect(rows).toHaveLength(2);
        expect(rows[0]?.searchTerm).toBe('gift for mom');
        expect(rows[1]?.searchTerm).toBe('gift for dad');
    });

    it('ignores category-path style keys in payload rows', () => {
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
