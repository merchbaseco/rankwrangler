import { describe, expect, it } from 'bun:test';
import {
    resolveWebSocketAuthorization,
    scheduleWebSocketCredentialExpiry,
} from './websocket-context';

describe('tRPC WebSocket context authorization', () => {
    it('uses a Clerk connection token as bearer authorization', () => {
        expect(
            resolveWebSocketAuthorization({
                headerAuthorization: undefined,
                connectionParams: { token: 'clerk_jwt' },
            })
        ).toBe('Bearer clerk_jwt');
        expect(
            resolveWebSocketAuthorization({
                headerAuthorization: undefined,
                connectionParams: { Authorization: 'Bearer clerk_jwt' },
            })
        ).toBe('Bearer clerk_jwt');
    });

    it('keeps explicit request authorization ahead of connection params', () => {
        expect(
            resolveWebSocketAuthorization({
                headerAuthorization: 'Bearer request_token',
                connectionParams: { token: 'connection_token' },
            })
        ).toBe('Bearer request_token');
    });

    it('closes the socket when the verified Clerk credential expires', () => {
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

        expect(scheduledDelayMs).toBe(5_000);
        expire?.();
        expect(closeCalls).toEqual([[4401, 'Clerk credential expired']]);
        cleanup?.();
        expect(clearedTimer).toBe(timer);
    });
});
