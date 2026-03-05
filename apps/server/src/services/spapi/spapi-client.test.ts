import { describe, expect, it } from 'bun:test';
import { SpApiClient, createSpApiClient } from '@/services/spapi/spapi-client.js';

describe('createSpApiClient', () => {
    it('returns a shared singleton instance', () => {
        const first = createSpApiClient();
        const second = createSpApiClient();

        expect(first).toBe(second);
        expect(first).toBeInstanceOf(SpApiClient);
    });
});
