import { describe, expect, it } from 'bun:test';
import { selectProductKeywords, topicSignature } from './product-keyword-selection';
import { scanBackpressure } from './keyword-scan-backpressure';

const row = (term: string, relevance: number | null = 0.9, verdict = 'accepted' as const) => ({
    candidateId: term,
    term,
    verdict,
    relevance,
});

describe('per-product keyword selection', () => {
    it('keeps Ads order and gives near variants one slot', () => {
        const rows = ['bigfoot shirt', 'funny bigfoot t-shirt', 'bigfoot christmas shirt'].map(
            term => row(term)
        );
        expect(selectProductKeywords([...rows, row('santa shirt')], 2)).toEqual([
            'bigfoot shirt',
            'bigfoot christmas shirt',
        ]);
        expect(topicSignature('Christma Bigfoot Tee')).toBe(topicSignature('bigfoot christmas'));
    });
    it('selects fewer than the limit rather than padding with weak or irrelevant phrases', () => {
        const rows = [
            row('bigfoot shirt'),
            row('batman shirt', 0.2),
            { ...row('t light'), verdict: 'rejected' as const },
            row('shirt'),
        ];
        expect(selectProductKeywords(rows, 5)).toEqual(['bigfoot shirt']);
    });
    it('defaults to five', () => {
        const rows = 'one two three four five six seven'.split(' ').map(word => row(`${word} cat`));
        expect(selectProductKeywords(rows)).toHaveLength(5);
    });
});

describe('scan backpressure', () => {
    it('closes producers past two days of productive background capacity', () => {
        const open = scanBackpressure({ queuedPages: 19_000, backgroundRps: 0.16 });
        expect(open).toEqual({ queuedPages: 19_000, pagesPerDay: 9677, producersOpen: true });
        expect(scanBackpressure({ queuedPages: 20_000, backgroundRps: 0.16 }).producersOpen).toBe(
            false
        );
    });
});
