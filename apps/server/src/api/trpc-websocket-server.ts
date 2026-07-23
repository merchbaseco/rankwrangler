import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { applyWSSHandler } from '@trpc/server/adapters/ws';
import { WebSocketServer } from 'ws';
import { realtimeRouter } from '@/api/realtime-router';
import { createWebSocketContext } from '@/api/websocket-context';

export const TRPC_WEBSOCKET_PATH = '/api/trpc';
export const TRPC_WEBSOCKET_MAX_PAYLOAD_BYTES = 64 * 1024;

export const registerTrpcWebsocketServer = (server: Server) => {
    const websocketServer = new WebSocketServer({
        noServer: true,
        maxPayload: TRPC_WEBSOCKET_MAX_PAYLOAD_BYTES,
    });
    applyWSSHandler({
        wss: websocketServer,
        router: realtimeRouter,
        createContext: createWebSocketContext,
        keepAlive: {
            enabled: true,
            pingMs: 10_000,
            pongWaitMs: 5000,
        },
    });

    const handleUpgrade = (request: IncomingMessage, socket: Duplex, head: Buffer) => {
        const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
        if (pathname !== TRPC_WEBSOCKET_PATH) {
            socket.destroy();
            return;
        }

        websocketServer.handleUpgrade(request, socket, head, client => {
            websocketServer.emit('connection', client, request);
        });
    };
    server.on('upgrade', handleUpgrade);

    return {
        close: () => {
            server.off('upgrade', handleUpgrade);
            for (const client of websocketServer.clients) {
                client.terminate();
            }
            websocketServer.close();
        },
    };
};
