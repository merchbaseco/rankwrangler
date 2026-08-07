import { describe, expect, it } from 'bun:test';
import { classifyMerchListing } from '@/services/merch-listing-classification';

describe('classifyMerchListing', () => {
    it('returns no classification for unavailable evidence', () => {
        expect(classifyMerchListing({ kind: 'unavailable' })).toBeNull();
    });

    it('classifies available empty evidence as known non-Merch', () => {
        expect(classifyMerchListing({ kind: 'available', bullets: [] })).toEqual({
            isMerchListing: false,
            bullet1: null,
            bullet2: null,
        });
    });

    it('matches templates and keeps the first two seller bullets', () => {
        expect(
            classifyMerchListing({
                kind: 'available',
                bullets: [
                    'Lightweight, Classic fit, Double-needle sleeve and bottom hem',
                    'Custom seller bullet one',
                    'Custom seller bullet two',
                    'Custom seller bullet three',
                ],
            })
        ).toEqual({
            isMerchListing: true,
            bullet1: 'Custom seller bullet one',
            bullet2: 'Custom seller bullet two',
        });
    });

    it('normalizes punctuation and whitespace for template matching', () => {
        expect(
            classifyMerchListing({
                kind: 'available',
                bullets: [
                    '  Dual-wall insulated stainless steel construction keeps beverages hot or cold, top rack dishwasher safe and BPA free  ',
                    'Seller bullet',
                ],
            })
        ).toEqual({
            isMerchListing: true,
            bullet1: 'Seller bullet',
            bullet2: null,
        });
    });
});
