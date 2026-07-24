import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { serve } from 'bun';
import { createTempDir, spawnCliAsync } from './test-helpers';

const TEMP_DIRS: string[] = [];
const CLI_TEST_SERVER_PORT = Number(
    execFileSync('dev-port', ['--group'], { encoding: 'utf8' }).trim().split(/\s+/)[1]
);

afterEach(() => {
    while (TEMP_DIRS.length > 0) {
        const tempDir = TEMP_DIRS.pop();
        if (tempDir) {
            rmSync(tempDir, { force: true, recursive: true });
        }
    }
});

describe('Catalog CLI', () => {
    test('requests a force-fresh Catalog search and prints the shared pending contract', async () => {
        const server = serve({
            port: CLI_TEST_SERVER_PORT,
            async fetch(request) {
                expect(request.url).toContain('catalog.search');
                const body = await request.json();
                expect(JSON.stringify(body)).toContain('"term":"retro gardening shirt"');
                expect(JSON.stringify(body)).toContain('"maxAgeSeconds":0');
                return Response.json([
                    {
                        result: {
                            data: {
                                status: 'pending',
                                operation: {
                                    id: '11111111-1111-4111-8111-111111111111',
                                    type: 'catalogSearch',
                                    status: 'pending',
                                    retryAfterSeconds: 2,
                                    createdAt: '2026-07-23T12:00:00.000Z',
                                    updatedAt: '2026-07-23T12:00:00.000Z',
                                },
                            },
                        },
                    },
                ]);
            },
        });
        const { tempHome, workspaceDir } = createCliWorkspace();

        try {
            const result = await spawnCliAsync(
                [
                    'catalog',
                    'search',
                    'retro',
                    'gardening',
                    'shirt',
                    '--maxAgeSeconds',
                    '0',
                    '--baseUrl',
                    `http://127.0.0.1:${server.port}`,
                ],
                {
                    cwd: workspaceDir,
                    home: tempHome,
                    env: { RR_LICENSE_KEY: 'rrk_test_value' },
                }
            );

            expect(result.status).toBe(0);
            expect(JSON.parse(result.stdout)).toMatchObject({
                ok: true,
                data: {
                    status: 'pending',
                    operation: { type: 'catalogSearch' },
                },
            });
        } finally {
            server.stop(true);
        }
    });

    test('reads Catalog query state through the matching public procedure', async () => {
        const server = serve({
            port: CLI_TEST_SERVER_PORT,
            fetch(request) {
                expect(request.url).toContain('catalog.query.get');
                expect(decodeURIComponent(request.url)).toContain('"term":"retro gardening shirt"');
                return Response.json([
                    {
                        result: {
                            data: {
                                id: '11111111-1111-4111-8111-111111111111',
                                source: 'keepa',
                                marketplaceId: 'ATVPDKIKX0DER',
                                normalizedTerm: 'retro gardening shirt',
                                displayTerm: 'Retro Gardening Shirt',
                                page: 0,
                                tracking: { enabled: false },
                                latestRun: null,
                            },
                        },
                    },
                ]);
            },
        });
        const { tempHome, workspaceDir } = createCliWorkspace();

        try {
            const result = await spawnCliAsync(
                [
                    'catalog',
                    'query',
                    'retro',
                    'gardening',
                    'shirt',
                    '--baseUrl',
                    `http://127.0.0.1:${server.port}`,
                ],
                {
                    cwd: workspaceDir,
                    home: tempHome,
                    env: { RR_LICENSE_KEY: 'rrk_test_value' },
                }
            );

            expect(result.status).toBe(0);
            expect(JSON.parse(result.stdout)).toEqual({
                ok: true,
                data: expect.objectContaining({
                    id: '11111111-1111-4111-8111-111111111111',
                    tracking: { enabled: false },
                }),
            });
        } finally {
            server.stop(true);
        }
    });

    test('explicitly tracks and untracks a Catalog query', async () => {
        const requests: string[] = [];
        const server = serve({
            port: CLI_TEST_SERVER_PORT,
            async fetch(request) {
                requests.push(request.url);
                const body = JSON.stringify(await request.json());
                const enabled = request.url.includes('catalog.query.track');
                expect(body).toContain('"term":"retro gardening shirt"');
                return Response.json([
                    {
                        result: {
                            data: {
                                id: '11111111-1111-4111-8111-111111111111',
                                tracking: {
                                    enabled,
                                    trackedAt: enabled ? '2026-07-24T12:00:00.000Z' : null,
                                },
                            },
                        },
                    },
                ]);
            },
        });
        const { tempHome, workspaceDir } = createCliWorkspace();

        try {
            for (const verb of ['track', 'untrack']) {
                const result = await spawnCliAsync(
                    [
                        'catalog',
                        verb,
                        'retro',
                        'gardening',
                        'shirt',
                        '--baseUrl',
                        `http://127.0.0.1:${server.port}`,
                    ],
                    {
                        cwd: workspaceDir,
                        home: tempHome,
                        env: { RR_LICENSE_KEY: 'rrk_test_value' },
                    }
                );
                expect(result.status).toBe(0);
                expect(JSON.parse(result.stdout).data.tracking.enabled).toBe(verb === 'track');
            }
            expect(requests[0]).toContain('catalog.query.track');
            expect(requests[1]).toContain('catalog.query.untrack');
        } finally {
            server.stop(true);
        }
    });

    test('lists one bounded page of Catalog runs through the matching public procedure', async () => {
        const server = serve({
            port: CLI_TEST_SERVER_PORT,
            fetch(request) {
                expect(request.url).toContain('catalog.run.list');
                const decodedUrl = decodeURIComponent(request.url);
                expect(decodedUrl).toContain('"queryId":"11111111-1111-4111-8111-111111111111"');
                expect(decodedUrl).toContain('"limit":5');
                expect(decodedUrl).toContain('"cursor":"22222222-2222-4222-8222-222222222222"');
                return Response.json([
                    {
                        result: {
                            data: {
                                items: [
                                    {
                                        id: '33333333-3333-4333-8333-333333333333',
                                        sourceStartedAt: '2026-07-23T11:59:00.000Z',
                                        sourceCompletedAt: '2026-07-23T12:00:00.000Z',
                                        resultCount: 0,
                                        normalizerVersion: 1,
                                        createdAt: '2026-07-23T12:00:00.000Z',
                                    },
                                ],
                                nextCursor: null,
                            },
                        },
                    },
                ]);
            },
        });
        const { tempHome, workspaceDir } = createCliWorkspace();

        try {
            const result = await spawnCliAsync(
                [
                    'catalog',
                    'runs',
                    '11111111-1111-4111-8111-111111111111',
                    '--limit',
                    '5',
                    '--cursor',
                    '22222222-2222-4222-8222-222222222222',
                    '--baseUrl',
                    `http://127.0.0.1:${server.port}`,
                ],
                {
                    cwd: workspaceDir,
                    home: tempHome,
                    env: { RR_LICENSE_KEY: 'rrk_test_value' },
                }
            );

            expect(result.status).toBe(0);
            expect(JSON.parse(result.stdout)).toEqual({
                ok: true,
                data: {
                    items: [
                        expect.objectContaining({
                            id: '33333333-3333-4333-8333-333333333333',
                            resultCount: 0,
                        }),
                    ],
                    nextCursor: null,
                },
            });
        } finally {
            server.stop(true);
        }
    });
});

const createCliWorkspace = () => {
    const tempRoot = createTempDir('rankwrangler-cli-', TEMP_DIRS);
    const tempHome = path.join(tempRoot, 'home');
    const workspaceDir = path.join(tempRoot, 'workspace');
    mkdirSync(tempHome, { recursive: true });
    mkdirSync(workspaceDir, { recursive: true });
    return { tempHome, workspaceDir };
};
