import { describe, expect, it } from 'bun:test';
import { researchDiscoveryScopes } from './discovery-candidate-policy';
describe('acquisition candidate fit', () => {
    it('tracks exactly the user phrase without inferred tags or companion searches', () => {
        expect(researchDiscoveryScopes(' RN ')).toEqual([{ kind: 'keyword', term: 'RN' }]);
        expect(researchDiscoveryScopes('B0TST00001')).toEqual([]);
    });
});
