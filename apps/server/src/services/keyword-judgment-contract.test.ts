import { describe, it, expect } from 'bun:test';
import { buildKeywordJudgmentRequest, parseKeywordJudgments } from './keyword-judgment-contract';
describe('Jev keyword judgment boundary', () => {
    it('uses independent multi-label judgments over phrases and maps actual Noul responses', () => {
        const rows = [
            { id: 'a', term: 'tropical christmas shirt' },
            { id: 'b', term: 't light' },
        ];
        const request = buildKeywordJudgmentRequest(rows);
        expect(Object.keys(request.questions)).toEqual(['candidate0', 'candidate1']);
        expect(request.questions.candidate0.type).toBe('noul');
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
});
