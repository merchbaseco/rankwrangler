import { describe, expect, it } from 'bun:test';
import { mapAccessErrorCode } from './trpc';

describe('centralized access error mapping', () => {
    it('keeps access denial and infrastructure failure distinguishable', () => {
        expect(mapAccessErrorCode('unauthenticated')).toBe('UNAUTHORIZED');
        expect(mapAccessErrorCode('access_denied')).toBe('FORBIDDEN');
        expect(mapAccessErrorCode('access_unavailable')).toBe('SERVICE_UNAVAILABLE');
        expect(mapAccessErrorCode(null)).toBe('UNAUTHORIZED');
    });
});
