import { describe, it, expect } from 'bun:test';
import {
    buildKeywordJudgmentRequest,
    buildProductRelevanceRequest,
    parseKeywordJudgments,
} from './keyword-judgment-contract';

describe('Jev keyword judgment boundary', () => {
    it('puts each phrase in its own question and keeps no shared candidate array', () => {
        const rows = [
            { id: 'a', term: 'tropical christmas shirt' },
            { id: 'b', term: 't light' },
        ];
        const request = buildKeywordJudgmentRequest(rows);
        expect(request.state).toEqual({ marketplace: 'Amazon' });
        expect(Object.keys(request.questions)).toEqual(['candidate0', 'candidate1']);
        expect(request.questions.candidate1.instructions.phrase).toBe('t light');
        expect(request.questions.candidate1.instructions.judgment).not.toContain('candidates[');
        expect(
            parseKeywordJudgments(rows, {
                answers: {
                    candidate0: { type: 'noul', noul: 0.95 },
                    candidate1: { type: 'noul', noul: 0.01 },
                },
            })
        ).toEqual([
            { id: 'a', probability: 0.95 },
            { id: 'b', probability: 0.01 },
        ]);
        expect(() =>
            parseKeywordJudgments(rows, { answers: { candidate0: { type: 'noul', noul: 0.95 } } })
        ).toThrow('omitted');
        expect(() =>
            parseKeywordJudgments(rows, {
                answers: { candidate0: { type: 'noul', probability: 0.95 } },
            })
        ).toThrow();
    });
    it('judges product relevance against the title and caps batches at 100', () => {
        const request = buildProductRelevanceRequest('Funny Cat Dad Shirt', [
            { id: 'a', term: 'cat dad shirt' },
        ]);
        expect(request.state.productTitle).toBe('Funny Cat Dad Shirt');
        expect(request.questions.candidate0.instructions.phrase).toBe('cat dad shirt');
        const rows = Array.from({ length: 101 }, (_, i) => ({ id: `${i}`, term: `term ${i}` }));
        expect(() => buildKeywordJudgmentRequest(rows)).toThrow('at most 100');
    });
});
