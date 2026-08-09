import { describe, expect, it } from 'bun:test';
import { createSpApiProvider, SpApiProvider } from './sp-api-provider';

describe('createSpApiProvider', () => {
    it('returns a shared singleton instance', () => {
        const first = createSpApiProvider();
        const second = createSpApiProvider();

        expect(first).toBe(second);
        expect(first).toBeInstanceOf(SpApiProvider);
    });
});
