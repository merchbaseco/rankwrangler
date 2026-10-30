import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { applyWSSHandler } from '@trpc/server/adapters/ws';
import { WebSocketServer } from 'ws';
import { createRequestContext } from '@/api/context';
import { realtimeRouter } from '@/api/realtime-router';
import { createWebSocketContext } from '@/api/websocket-context';
import type { RankWranglerAccess } from '@/services/access/rankwrangler-access';

export const TRPC_WEBSOCKET_PATH = '/api/trpc';
export const TRPC_WEBSOCKET_MAX_PAYLOAD_BYTES = 64 * 1024;

export const registerTrpcWebsocketServer = (
    server: Server,
    access: Pick<RankWranglerAccess, 'authorizeRequest' | 'grantDeadline'> | null = null
) => {
    const websocketServer = new WebSocketServer({
        noServer: true,
        maxPayload: TRPC_WEBSOCKET_MAX_PAYLOAD_BYTES,
    });
    const users = new Map<import('ws').WebSocket, string>();
    applyWSSHandler({
        wss: websocketServer,
        router: realtimeRouter,
        createContext: async options => {
            options.res.once('close', () => users.delete(options.res));
            return await createWebSocketContext(options, access, uid =>
                users.set(options.res, uid)
            );
        },
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

        const authorizeUpgrade = async () => {
            const context = await createRequestContext(
                {
                    headers: {
                        host: request.headers.host,
                        'cf-access-jwt-assertion':
                            typeof request.headers['cf-access-jwt-assertion'] === 'string'
                                ? request.headers['cf-access-jwt-assertion']
                                : undefined,
                        'x-merchbase-user-id': request.headers['x-merchbase-user-id'],
                    },
                },
                access
            );
            if (context.authType !== 'access' || context.credentialKind !== 'session') {
                socket.end(
                    'HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'
                );
                return;
            }
            if (socket.destroyed) {
                return;
            }
            websocketServer.handleUpgrade(request, socket, head, client => {
                websocketServer.emit('connection', client, request);
            });
        };
        authorizeUpgrade().catch(() => socket.destroy());
    };
    server.on('upgrade', handleUpgrade);

    return {
        disconnectUser: (uid: string) => {
            for (const [client, owner] of users) {
                if (owner === uid) {
                    client.close(4403, 'Access revoked');
                }
            }
        },
        close: () => {
            server.off('upgrade', handleUpgrade);
            for (const client of websocketServer.clients) {
                client.terminate();
            }
            websocketServer.close();
        },
    };
};
