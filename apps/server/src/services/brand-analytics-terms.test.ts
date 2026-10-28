import { describe, expect, it } from 'bun:test';
import {
    createBrandAnalyticsAccumulator,
    latestBrandAnalyticsWeek,
    MERCH_PRODUCT_TITLE_PATTERN,
} from './brand-analytics-terms';

const row = (searchTerm: string, rank: number, asin: string, title: string, order: number) => ({
    searchTerm,
    searchFrequencyRank: rank,
    clickedAsin: asin,
    clickedItemName: title,
    clickShareRank: order,
});

describe('Merch product title pattern', () => {
    it('matches every Merch product type as whole words', () => {
        for (const title of [
            'Funny Nurse T-Shirt',
            'Retro tshirt',
            'Graphic Tee',
            'Pullover Hoodie',
            'Crewneck Sweatshirt',
            'Tank Top',
            'Cute Summer Tops for Women',
            'Raglan Baseball Tee',
            'V-Neck T-Shirt',
            'Hockey Jersey',
            'Golf Polo Shirt',
            'Funny Fishing Quarter-Zip Pullover',
            'Softshell Jacket',
            'Trucker Hat',
            'Retro Dad Cap',
            'Sun Visor',
            'School Backpack',
            'Cat Mom PopSockets Swappable PopGrip',
            'iPhone 15 Pro Max Case',
            'Teacher Tote Bag',
            'Crossbody Bag',
            'Laptop Sleeve',
            'Gaming Mouse Pad',
            'Throw Pillow',
            'Fleece Throw Blanket',
            'Retro Movie Poster',
            'Stainless Steel Insulated Tumbler',
            'Funny Coffee Mug',
            'Water Bottle',
            'Hardcover Journal',
            'Retractable Pen',
        ])
            expect(MERCH_PRODUCT_TITLE_PATTERN.test(title)).toBe(true);
        for (const title of [
            'Halloween Makeup Kit',
            'Christmas Lights',
            'Teeth Whitening',
            'Face Paint',
            'Hatchet for Camping',
            'Laptop Stand',
            'Capsule Coffee Machine',
            'Top Rated Air Fryer',
            'Penguin Plush',
        ])
            expect(MERCH_PRODUCT_TITLE_PATTERN.test(title)).toBe(false);
    });
});

describe('Brand Analytics accumulator', () => {
    it('keeps terms with at least one Merch product click and drops the rest', () => {
        const accumulator = createBrandAnalyticsAccumulator();
        for (const input of [
            row('Halloween Makeup', 40, 'B0MAKEUP01', 'Halloween Makeup Kit', 1),
            row('Halloween Makeup', 40, 'B0MAKEUP02', 'Face Paint', 2),
            row('  Nurse   Shirt, ', 7, 'B0NURSE001', 'Mug for Nurses', 1),
            row('  Nurse   Shirt, ', 7, 'B0NURSE002', 'Nurse Life T-Shirt', 2),
            row('  Nurse   Shirt, ', 7, 'B0NURSE003', 'Nurse Hoodie', 3),
            row('christmas lights', 3, 'B0LIGHTS01', 'LED String Lights', 1),
            row('teacher gifts', 12, 'B0TOTE0001', 'Teacher Appreciation Tote Bag', 1),
        ])
            accumulator.add(input);
        expect(accumulator.finish()).toEqual({
            rows: 7,
            terms: 4,
            kept: [
                {
                    term: 'nurse shirt',
                    rank: 7,
                    clickedAsins: ['B0NURSE001', 'B0NURSE002', 'B0NURSE003'],
                    apparelClicks: 3,
                },
                {
                    term: 'teacher gifts',
                    rank: 12,
                    clickedAsins: ['B0TOTE0001'],
                    apparelClicks: 1,
                },
            ],
        });
    });
    it('merges a term that reappears and keeps its top three clicks', () => {
        const accumulator = createBrandAnalyticsAccumulator();
        accumulator.add(row('dog mom', 900, 'B0DOGMOM02', 'Dog Mom Shirt', 2));
        accumulator.add(row('cat dad', 901, 'B0CATDAD01', 'Cat Dad Tee', 1));
        accumulator.add(row('dog mom', 900, 'B0DOGMOM01', 'Dog Mom Mug', 1));
        accumulator.add(row('dog mom', 900, 'B0DOGMOM04', 'Dog Mom Hoodie', 4));
        accumulator.add(row('dog mom', 900, 'B0DOGMOM03', 'Dog Mom Sticker', 3));
        expect(accumulator.finish().kept).toEqual([
            {
                term: 'dog mom',
                rank: 900,
                clickedAsins: ['B0DOGMOM01', 'B0DOGMOM02', 'B0DOGMOM03'],
                apparelClicks: 2,
            },
            { term: 'cat dad', rank: 901, clickedAsins: ['B0CATDAD01'], apparelClicks: 1 },
        ]);
    });
    it('ignores rows without a usable term or rank', () => {
        const accumulator = createBrandAnalyticsAccumulator();
        accumulator.add(row('', 1, 'B0EMPTY001', 'Shirt', 1));
        accumulator.add(row('b0abcdefgh', 2, 'B0ASIN0001', 'Shirt', 1));
        accumulator.add(row('teacher shirt', 0, 'B0TEACH001', 'Shirt', 1));
        expect(accumulator.finish()).toMatchObject({ rows: 3, terms: 0, kept: [] });
    });
});

describe('latest Brand Analytics week', () => {
    it('picks the latest Sunday–Saturday week Amazon has had two days to publish', () => {
        // 2026-10-24 is a Saturday.
        expect(latestBrandAnalyticsWeek(new Date('2026-10-27T00:00:00Z'))).toEqual({
            weekStart: '2026-10-18',
            weekEnd: '2026-10-24',
        });
        expect(latestBrandAnalyticsWeek(new Date('2026-10-26T23:59:59Z'))).toEqual({
            weekStart: '2026-10-11',
            weekEnd: '2026-10-17',
        });
        expect(latestBrandAnalyticsWeek(new Date('2026-10-31T12:00:00Z'))).toEqual({
            weekStart: '2026-10-18',
            weekEnd: '2026-10-24',
        });
    });
});
