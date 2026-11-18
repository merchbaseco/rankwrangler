import { expect, it } from 'bun:test';
import { createServer, type IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { realtimeRouter } from '@/api/realtime-router';
import {
    registerTrpcWebsocketServer,
    TRPC_WEBSOCKET_MAX_PAYLOAD_BYTES,
    TRPC_WEBSOCKET_PATH,
} from '@/api/trpc-websocket-server';

const flushMicrotasks = () => new Promise<void>((resolve) => setImmediate(resolve));

it('exposes only domain subscriptions over WebSockets', () => {
    expect(Object.keys(realtimeRouter._def.procedures)).toEqual([
        'api.app.keyword.directory.changed',
        'api.app.syncControl.changed',
        'api.app.activity.created',
        'api.app.catalog.search.completed',
        'api.app.product.sync.completed',
        'api.app.product.history.refresh.completed',
    ]);
});

it('uses a bounded payload for the dedicated tRPC WebSocket endpoint', () => {
    expect(TRPC_WEBSOCKET_PATH).toBe('/api/trpc');
    expect(TRPC_WEBSOCKET_MAX_PAYLOAD_BYTES).toBe(64 * 1024);
});

it('destroys upgrade sockets outside the dedicated tRPC path', () => {
    const server = createServer();
    const realtimeServer = registerTrpcWebsocketServer(server);
    let destroyed = false;

    server.emit(
        'upgrade',
        { url: '/api/health' } as IncomingMessage,
        {
            destroy: () => {
                destroyed = true;
            },
        } as Duplex,
        Buffer.alloc(0)
    );

    expect(destroyed).toBe(true);
    realtimeServer.close();
    server.close();
});

it('rejects an upgrade with no Origin header before auth runs', () => {
    const server = createServer();
    let authorizeRequestCalled = false;
    const realtimeServer = registerTrpcWebsocketServer(
        server,
        {
            authorizeRequest: () => {
                authorizeRequestCalled = true;
                return Promise.reject(new Error('should not be called'));
            },
            grantDeadline: () => Promise.resolve(null),
        },
        { isProduction: true }
    );
    let ended = '';

    server.emit(
        'upgrade',
        { url: TRPC_WEBSOCKET_PATH, headers: {} } as IncomingMessage,
        {
            end: (chunk: string) => {
                ended = chunk;
            },
        } as Duplex,
        Buffer.alloc(0)
    );

    expect(ended).toContain('403');
    expect(authorizeRequestCalled).toBe(false);
    realtimeServer.close();
    server.close();
});

it('accepts a deployed dashboard Origin past the Origin gate', async () => {
    const server = createServer();
    let authorizeRequestCalled = false;
    const realtimeServer = registerTrpcWebsocketServer(
        server,
        {
            authorizeRequest: () => {
                authorizeRequestCalled = true;
                return Promise.reject(new Error('unauthenticated'));
            },
            grantDeadline: () => Promise.resolve(null),
        },
        { isProduction: true }
    );
    let ended = '';

    server.emit(
        'upgrade',
        {
            url: TRPC_WEBSOCKET_PATH,
            headers: { origin: 'https://rankwrangler.merchbase.co' },
        } as IncomingMessage,
        {
            end: (chunk: string) => {
                ended = chunk;
            },
            destroyed: false,
        } as unknown as Duplex,
        Buffer.alloc(0)
    );
    await flushMicrotasks();

    expect(authorizeRequestCalled).toBe(true);
    expect(ended).toContain('401');
    expect(ended).not.toContain('403');
    realtimeServer.close();
    server.close();
});

it('gates a loopback Origin by isProduction', async () => {
    const makeUpgrade = async (isProduction: boolean) => {
        const server = createServer();
        const realtimeServer = registerTrpcWebsocketServer(
            server,
            {
                authorizeRequest: () => Promise.reject(new Error('unauthenticated')),
                grantDeadline: () => Promise.resolve(null),
            },
            { isProduction }
        );
        let ended = '';

        server.emit(
            'upgrade',
            {
                url: TRPC_WEBSOCKET_PATH,
                headers: { origin: 'http://localhost:5173' },
            } as IncomingMessage,
            {
                end: (chunk: string) => {
                    ended = chunk;
                },
                destroyed: false,
            } as unknown as Duplex,
            Buffer.alloc(0)
        );
        await flushMicrotasks();

        realtimeServer.close();
        server.close();
        return ended;
    };

    expect(await makeUpgrade(true)).toContain('403');
    expect(await makeUpgrade(false)).toContain('401');
});
