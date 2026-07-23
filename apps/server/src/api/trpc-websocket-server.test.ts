import { expect, it } from 'bun:test';
import { createServer, type IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { realtimeRouter } from '@/api/realtime-router';
import {
    registerTrpcWebsocketServer,
    TRPC_WEBSOCKET_MAX_PAYLOAD_BYTES,
    TRPC_WEBSOCKET_PATH,
} from '@/api/trpc-websocket-server';

it('exposes only the Product-history completion subscription over WebSockets', () => {
    expect(Object.keys(realtimeRouter._def.procedures)).toEqual([
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
