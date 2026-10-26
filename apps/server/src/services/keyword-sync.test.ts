import { describe, expect, it, mock } from 'bun:test';
import { processKeywordSync } from './keyword-sync';

const result = { didWork: true, kind: 'complete', nextWakeAt: new Date() };
describe('one keyword sync coordinator', () => {
    it('does not admit keyword work while paused', async () => {
        const step = mock(async () => result);
        expect(await processKeywordSync({ isPaused: async () => true, steps: [step] })).toEqual({
            didWork: false,
            paused: true,
            nextWakeAt: null,
        });
        expect(step).not.toHaveBeenCalled();
    });
    it('lets the current stage save and stops before taking the next stage', async () => {
        let paused = false;
        const next = mock(async () => result);
        const output = await processKeywordSync({
            isPaused: async () => paused,
            steps: [
                async () => {
                    paused = true;
                    return result;
                },
                next,
            ],
        });
        expect(output).toEqual({ didWork: true, paused: true, nextWakeAt: null });
        expect(next).not.toHaveBeenCalled();
    });
    it('spaces work cycles at least ten seconds and leaves an idle queue to the watchdog', async () => {
        const now = Date.now();
        const output = await processKeywordSync({
            isPaused: async () => false,
            steps: [async () => result],
        });
        expect(output.nextWakeAt!.getTime()).toBeGreaterThanOrEqual(now + 10_000);
        expect(
            (
                await processKeywordSync({
                    isPaused: async () => false,
                    steps: [async () => ({ ...result, didWork: false, nextWakeAt: null })],
                })
            ).nextWakeAt
        ).toBeNull();
    });
    it('allows healthy stages to progress when another provider fails, then reports the error', async () => {
        const healthy = mock(async () => result);
        await expect(
            processKeywordSync({
                isPaused: async () => false,
                steps: [
                    async () => ({
                        ...result,
                        kind: 'failed',
                        didWork: false,
                        error: new Error('provider unavailable'),
                    }),
                    healthy,
                ],
            })
        ).rejects.toThrow('provider unavailable');
        expect(healthy).toHaveBeenCalledTimes(1);
    });
});
