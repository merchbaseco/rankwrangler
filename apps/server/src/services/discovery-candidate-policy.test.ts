import { describe, expect, it } from 'bun:test';
import { researchDiscoveryScopes, normalizeDiscoveryKeyword } from './discovery-candidate-policy';
describe('acquisition candidate fit', () => {
    it('tracks exactly the user phrase without inferred tags or companion searches', () => {
        expect(researchDiscoveryScopes(' RN ')).toEqual([{ kind: 'keyword', term: 'RN' }]);
        expect(researchDiscoveryScopes('B0TST00001')).toEqual([]);
    });
    it('removes stray trailing commas without rewriting internal punctuation or brands', () => {
        expect(normalizeDiscoveryKeyword(' Mele  Kalikimaka t shirt, , ')).toBe(
            'Mele Kalikimaka t shirt'
        );
        expect(normalizeDiscoveryKeyword('peace, love, fishing,')).toBe('peace, love, fishing');
        expect(researchDiscoveryScopes('fishing shirt,')).toEqual([
            { kind: 'keyword', term: 'fishing shirt' },
        ]);
    });
});
