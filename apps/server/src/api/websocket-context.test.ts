import { describe, expect, it } from 'bun:test';
import { scheduleWebSocketCredentialExpiry } from './websocket-context';

describe('tRPC WebSocket context authorization', () => {
    it('closes the socket when the verified Access credential expires', () => {
        const closeCalls: unknown[][] = [];
        let expire: (() => void) | undefined;
        let cleanup: (() => void) | undefined;
        let clearedTimer: unknown;
        let scheduledDelayMs: number | undefined;
        const timer = Symbol('timer');

        scheduleWebSocketCredentialExpiry({
            client: {
                close: (...args) => closeCalls.push(args),
                once: (_event, listener) => {
                    cleanup = listener;
                },
            },
            expiresAtMs: 15_000,
            nowMs: 10_000,
            setTimer: (listener, delayMs) => {
                expire = listener;
                scheduledDelayMs = delayMs;
                return timer;
            },
            clearTimer: value => {
                clearedTimer = value;
            },
        });

        expect(scheduledDelayMs).toBe(5000);
        expire?.();
        expect(closeCalls).toEqual([[4401, 'Access credential expired']]);
        cleanup?.();
        expect(clearedTimer).toBe(timer);
    });
});
