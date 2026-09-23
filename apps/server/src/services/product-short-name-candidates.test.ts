import { describe, expect, it } from 'bun:test';
import { buildShortNameCandidates } from './product-short-name-candidates';

describe('Product short-name candidates', () => {
    it('keeps source-exact phrases beyond the title prefix', () => {
        expect(
            buildShortNameCandidates(
                'Funny Thanksgiving Turkey Just Here for the Rolls Dinner T-Shirt'
            )
        ).toContain('Just Here for the Rolls');
        expect(
            buildShortNameCandidates('Never Underestimate an Old Man with A Dirt Bike - Motocross')
        ).toContain('Old Man with A Dirt Bike');
        expect(
            buildShortNameCandidates('100 Days of School Friendship Bracelets 100 Days Smarter Kid')
        ).toContain('100 Days Smarter');
    });

    it('bounds long titles and keeps NONE reserved for abstention', () => {
        const candidates = buildShortNameCandidates(
            Array.from({ length: 80 }, (_, index) => `word${index}`).join(' ')
        );
        expect(candidates.length).toBeLessThanOrEqual(120);
        expect(candidates).toContain('word0');
        expect(candidates).not.toContain('NONE');
    });
});
