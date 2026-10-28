import { describe, expect, it, mock } from 'bun:test';
import { scheduleBrandAnalytics } from './brand-analytics-scheduler';

describe('Brand Analytics six-hour check', () => {
    it('starts the due import and nudges keyword listing', async () => {
        const send = mock(async () => 'job');
        const result = await scheduleBrandAnalytics(
            { send } as never,
            (async () => ({ id: 'week' })) as never
        );
        expect(send.mock.calls).toEqual([
            ['import-brand-analytics', { importId: 'week' }, { singletonKey: 'week' }],
            ['register-brand-analytics-keywords', {}, { singletonKey: 'brand-analytics-keywords' }],
        ]);
        expect(result).toEqual({ didWork: true, importId: 'week' });
    });
    it('only nudges keyword listing when no import is due', async () => {
        const send = mock(async () => null);
        const result = await scheduleBrandAnalytics({ send } as never, (async () => null) as never);
        expect(send.mock.calls.map(call => call[0] as string)).toEqual([
            'register-brand-analytics-keywords',
        ]);
        expect(result.didWork).toBe(false);
    });
});
