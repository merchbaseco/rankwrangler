import { describe, expect, it } from 'bun:test';
import { classifyMerchBullets } from '@/utils/merch-bullets.js';

describe('classifyMerchBullets', () => {
    it('marks listing as merch and keeps only seller bullets', () => {
        const result = classifyMerchBullets([
            'Lightweight, Classic fit, Double-needle sleeve and bottom hem',
            'Custom seller bullet one',
            'Custom seller bullet two',
            'Custom seller bullet three',
        ]);

        expect(result.isMerchListing).toBe(true);
        expect(result.bullet1).toBe('Custom seller bullet one');
        expect(result.bullet2).toBe('Custom seller bullet two');
        expect(result.sellerBullets).toEqual([
            'Custom seller bullet one',
            'Custom seller bullet two',
        ]);
    });

    it('does not persist seller bullets for non-merch listings', () => {
        const result = classifyMerchBullets([
            'Custom seller bullet one',
            'Custom seller bullet two',
        ]);

        expect(result.isMerchListing).toBe(false);
        expect(result.bullet1).toBeNull();
        expect(result.bullet2).toBeNull();
        expect(result.sellerBullets).toEqual([]);
    });

    it('normalizes punctuation and whitespace for merch bullet matching', () => {
        const result = classifyMerchBullets([
            '  Dual-wall insulated stainless steel construction keeps beverages hot or cold, top rack dishwasher safe and BPA free  ',
            'Seller bullet',
        ]);

        expect(result.isMerchListing).toBe(true);
        expect(result.bullet1).toBe('Seller bullet');
        expect(result.bullet2).toBeNull();
    });
});
