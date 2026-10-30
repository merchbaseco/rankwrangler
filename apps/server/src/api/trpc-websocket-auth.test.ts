import { expect, test } from 'bun:test';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { ServiceAccessError } from '@merchbaseco/access';
import { WebSocket } from 'ws';
import type { RankWranglerServicePrincipal } from '@/services/access/rankwrangler-access';
import { registerTrpcWebsocketServer } from './trpc-websocket-server';

const principal: RankWranglerServicePrincipal = {
    id: '11111111-1111-4111-8111-111111111111',
    service: 'rankwrangler',
    merchbaseUserId: 'mbu_test',
};
for (const credentialKind of [null, 'oauth', 'session'] as const) {
    test(`WebSocket upgrade ${credentialKind ?? 'anonymous'} is checked before accepting the connection`, async () => {
        const server = createServer();
        const transport = registerTrpcWebsocketServer(server, {
            authorizeRequest: () =>
                credentialKind
                    ? Promise.resolve({
                          credentialKind,
                          principal,
                          merchbaseUserId: principal.merchbaseUserId,
                          service: 'rankwrangler' as const,
                          expiresAtMs: Date.now() + 300_000,
                      })
                    : Promise.reject(new ServiceAccessError('unauthenticated')),
            grantDeadline: () => Promise.resolve(null),
        });
        server.listen(0, '127.0.0.1');
        await once(server, 'listening');
        const address = server.address();
        if (!address || typeof address === 'string') {
            throw new Error('Expected local TCP listener');
        }
        const client = new WebSocket(`ws://127.0.0.1:${address.port}/api/trpc`);
        try {
            const status = await new Promise<number>((resolve, reject) => {
                client.on('error', reject);
                client.on('open', () => resolve(101));
                client.on('unexpected-response', (_request, response) => {
                    response.resume();
                    resolve(response.statusCode ?? 0);
                });
            });
            expect(status).toBe(credentialKind === 'session' ? 101 : 401);
        } finally {
            client.terminate();
            transport.close();
            await new Promise<void>(resolve => server.close(() => resolve()));
        }
    });
}
