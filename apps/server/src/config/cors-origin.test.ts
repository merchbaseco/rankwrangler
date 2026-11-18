import cors from '@fastify/cors';
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import { afterEach, describe, expect, it } from 'bun:test';
import Fastify, { type FastifyInstance } from 'fastify';
import { createCorsOriginHandler } from './cors-origin';
import { publicProcedure, router } from '@/api/trpc';

const servers: FastifyInstance[] = [];

describe('CORS origin policy', () => {
    afterEach(async () => {
        await Promise.all(servers.splice(0).map((server) => server.close()));
    });

    it('preserves the tRPC batch envelope for a worktree dev-port origin', async () => {
        const testRouter = router({
            productSearch: publicProcedure.mutation(() => ({ asin: 'B09B8V1LZ3' })),
            loadProductHistory: publicProcedure.mutation(() => ({
                operation: {
                    id: '8d16bcbf-b4a8-41e5-8e9b-a783418aa179',
                    status: 'pending' as const,
                },
            })),
        });
        const server = Fastify();
        servers.push(server);
        await server.register(cors, {
            origin: createCorsOriginHandler({
                isProduction: false,
                allowedChromeExtensionIds: ['hfoliiddbbblflnaakfggibiiphalbnc'],
            }),
            credentials: true,
        });
        await server.register(fastifyTRPCPlugin, {
            prefix: '/api',
            trpcOptions: {
                router: testRouter,
                createContext: () => ({}),
            },
        });
        await server.listen({ host: '127.0.0.1', port: 0 });

        const address = server.server.address();
        if (!address || typeof address === 'string') {
            throw new Error('Expected a TCP server address');
        }
        const client = createTRPCProxyClient<typeof testRouter>({
            links: [
                httpBatchLink({
                    url: `http://127.0.0.1:${address.port}/api`,
                    headers: {
                        Origin: 'http://127.0.0.1:21865',
                    },
                }),
            ],
        });

        const [firstProduct, secondProduct, history] = await Promise.all([
            client.productSearch.mutate(),
            client.productSearch.mutate(),
            client.loadProductHistory.mutate(),
        ]);

        expect(firstProduct).toEqual({ asin: 'B09B8V1LZ3' });
        expect(secondProduct).toEqual({ asin: 'B09B8V1LZ3' });
        expect(history.operation.status).toBe('pending');
    });

    it('rejects loopback origins in production', async () => {
        const handler = createCorsOriginHandler({
            isProduction: true,
            allowedChromeExtensionIds: ['hfoliiddbbblflnaakfggibiiphalbnc'],
        });

        const result = await new Promise<{ error: Error | null; allowed?: boolean }>((resolve) => {
            handler('http://127.0.0.1:21865', (error, allowed) => {
                resolve({ error, allowed });
            });
        });

        expect(result.error?.message).toBe('Not allowed by CORS');
        expect(result.allowed).toBe(false);
    });

    it('allows the shipped Chrome extension origin', async () => {
        const handler = createCorsOriginHandler({
            isProduction: true,
            allowedChromeExtensionIds: ['hfoliiddbbblflnaakfggibiiphalbnc'],
        });

        const result = await new Promise<{ error: Error | null; allowed?: boolean }>((resolve) => {
            handler('chrome-extension://hfoliiddbbblflnaakfggibiiphalbnc', (error, allowed) => {
                resolve({ error, allowed });
            });
        });

        expect(result.allowed).toBe(true);
        expect(result.error).toBeNull();
    });

    it('rejects a chrome-extension origin that is not in the allowlist', async () => {
        const handler = createCorsOriginHandler({
            isProduction: true,
            allowedChromeExtensionIds: ['hfoliiddbbblflnaakfggibiiphalbnc'],
        });

        const result = await new Promise<{ error: Error | null; allowed?: boolean }>((resolve) => {
            handler('chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', (error, allowed) => {
                resolve({ error, allowed });
            });
        });

        expect(result.allowed).toBe(false);
        expect(result.error?.message).toBe('Not allowed by CORS');
    });

    it('allows only the configured extension id, not the shipped default', async () => {
        const handler = createCorsOriginHandler({
            isProduction: true,
            allowedChromeExtensionIds: ['bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'],
        });

        const configured = await new Promise<{ allowed?: boolean }>((resolve) => {
            handler('chrome-extension://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', (_error, allowed) => {
                resolve({ allowed });
            });
        });
        const shipped = await new Promise<{ allowed?: boolean }>((resolve) => {
            handler('chrome-extension://hfoliiddbbblflnaakfggibiiphalbnc', (_error, allowed) => {
                resolve({ allowed });
            });
        });

        expect(configured.allowed).toBe(true);
        expect(shipped.allowed).toBe(false);
    });
});
