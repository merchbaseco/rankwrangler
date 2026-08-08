import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { serve } from 'bun';
import { createTempDir, runCliFailure, spawnCli, spawnCliAsync } from './test-helpers';

const TEMP_DIRS: string[] = [];
const CLI_TEST_SERVER_PORT = Number(
    execFileSync('dev-port', ['--group'], { encoding: 'utf8' }).trim().split(/\s+/)[0]
);

afterEach(() => {
    while (TEMP_DIRS.length > 0) {
        const tempDir = TEMP_DIRS.pop();
        if (tempDir) {
            rmSync(tempDir, { force: true, recursive: true });
        }
    }
});

describe('final public CLI contract', () => {
    test('runs Product get, search, and history with final public contracts', async () => {
        const requests: Array<{ procedure: string; input: Record<string, unknown> }> = [];
        const server = serve({
            port: CLI_TEST_SERVER_PORT,
            async fetch(request) {
                const procedure = new URL(request.url).pathname.split('.').at(-1) ?? '';
                const body = (await request.json()) as
                    | Array<{ json?: { input?: Record<string, unknown> } }>
                    | {
                          '0'?:
                              | { json?: { input?: Record<string, unknown> } }
                              | Record<string, unknown>;
                      };
                const first = Array.isArray(body) ? body[0] : body['0'];
                const input =
                    first && 'json' in first
                        ? first.json?.input
                        : (first as Record<string, unknown> | undefined);
                requests.push({
                    procedure,
                    input: input ?? {},
                });

                if (procedure === 'get') {
                    return Response.json([
                        {
                            result: {
                                data: {
                                    marketplaceId: 'ATVPDKIKX0DER',
                                    asin: 'B012345678',
                                    listing: {
                                        title: null,
                                        brand: null,
                                        firstAvailableAt: null,
                                        bulletPoints: [],
                                        thumbnail: { status: 'unavailable' },
                                        isMerchListing: null,
                                    },
                                    category: null,
                                    salesRank: {
                                        current: null,
                                        averages: { last30Days: null, last90Days: null },
                                    },
                                    price: null,
                                    demand: {
                                        boughtInPastMonth: null,
                                        salesRankDrops: {
                                            last30Days: null,
                                            last90Days: null,
                                            last180Days: null,
                                            last365Days: null,
                                        },
                                    },
                                },
                            },
                        },
                    ]);
                }
                if (procedure === 'search') {
                    return Response.json([
                        {
                            result: {
                                data: {
                                    status: 'ready',
                                    run: { id: '22222222-2222-4222-8222-222222222222' },
                                    freshness: {
                                        stale: false,
                                        updatedAt: '2026-08-06T12:00:00.000Z',
                                    },
                                },
                            },
                        },
                    ]);
                }
                return Response.json([
                    {
                        result: {
                            data: {
                                marketplaceId: 'ATVPDKIKX0DER',
                                asin: 'B012345678',
                                range: {
                                    startAt: '2026-01-01T00:00:00.000Z',
                                    endAt: '2026-08-01T00:00:00.000Z',
                                    interval: 'month',
                                },
                                series: {},
                            },
                        },
                    },
                ]);
            },
        });
        const workspace = createCliWorkspace();

        try {
            const baseArgs = ['--baseUrl', `http://127.0.0.1:${server.port}`];
            const searchArgs = ['--refresh', ...baseArgs];
            const getResult = await spawnCliAsync(['product', 'get', 'B012345678', ...baseArgs], {
                ...workspace,
                env: { MERCHBASE_API_KEY: 'ak_test_value' },
            });
            const searchResult = await spawnCliAsync(
                ['product', 'search', 'retro', 'gardening', 'shirt', ...searchArgs],
                { ...workspace, env: { MERCHBASE_API_KEY: 'ak_test_value' } }
            );
            const historyResult = await spawnCliAsync(
                ['product', 'history', 'B012345678', ...baseArgs],
                { ...workspace, env: { MERCHBASE_API_KEY: 'ak_test_value' } }
            );

            expect(getResult.status).toBe(0);
            expect(searchResult.status).toBe(0);
            expect(historyResult.status).toBe(0);
            expect(JSON.parse(searchResult.stdout)).toMatchObject({
                ok: true,
                data: { run: { id: '22222222-2222-4222-8222-222222222222' } },
            });
            expect(requests).toEqual([
                {
                    procedure: 'get',
                    input: {
                        marketplaceId: 'ATVPDKIKX0DER',
                        asin: 'B012345678',
                    },
                },
                {
                    procedure: 'search',
                    input: { term: 'retro gardening shirt', refresh: true },
                },
                {
                    procedure: 'history',
                    input: {
                        marketplaceId: 'ATVPDKIKX0DER',
                        asin: 'B012345678',
                        metrics: ['salesRank', 'price'],
                        bucket: 'auto',
                        days: 365,
                        limit: 5000,
                    },
                },
            ]);
        } finally {
            server.stop(true);
        }
    });

    test('runs keyword get, search, and history with final output data', async () => {
        const requests: string[] = [];
        const server = serve({
            port: CLI_TEST_SERVER_PORT,
            fetch(request) {
                const procedure = new URL(request.url).pathname.split('.').at(-1) ?? '';
                requests.push(procedure);
                let data: Record<string, unknown>;
                if (procedure === 'get') {
                    data = {
                        keyword: 'garden shirt',
                        status: 'empty',
                        current: null,
                    };
                } else if (procedure === 'search') {
                    data = {
                        status: 'empty',
                        items: [],
                        nextCursor: null,
                        summary: {},
                    };
                } else {
                    data = {
                        keyword: 'garden shirt',
                        status: 'empty',
                        points: [],
                    };
                }
                return Response.json([{ result: { data } }]);
            },
        });
        const workspace = createCliWorkspace();

        try {
            const baseArgs = ['--baseUrl', `http://127.0.0.1:${server.port}`];
            for (const args of [
                ['keyword', 'get', 'garden shirt', ...baseArgs],
                ['keyword', 'search', 'garden shirt', ...baseArgs],
                ['keyword', 'history', 'garden shirt', ...baseArgs],
            ]) {
                const result = await spawnCliAsync(args, {
                    ...workspace,
                    env: { MERCHBASE_API_KEY: 'ak_test_value' },
                });
                expect(result.status).toBe(0);
            }
            expect(requests).toEqual(['get', 'search', 'history']);
        } finally {
            server.stop(true);
        }
    });

    test('rejects refresh on Product get/history and keyword reads', () => {
        const workspace = createCliWorkspace();
        const commands = [
            ['product', 'get', 'B012345678', '--refresh'],
            ['product', 'history', 'B012345678', '--refresh'],
            ['keyword', 'get', 'garden shirt', '--refresh'],
        ];

        for (const args of commands) {
            expect(
                runCliFailure(args, {
                    ...workspace,
                    env: { MERCHBASE_API_KEY: 'ak_test_value' },
                })
            ).toMatchObject({
                ok: false,
                error: { code: 'INVALID_INPUT' },
            });
        }
    });

    test('rejects superseded plural, Catalog, and Operation commands', () => {
        const workspace = createCliWorkspace();
        const commands = [
            ['products', 'get', 'B012345678'],
            ['catalog', 'search', 'shirts'],
            ['operations', 'get', '11111111-1111-4111-8111-111111111111'],
        ];

        for (const args of commands) {
            const result = spawnCli(args, workspace);
            expect(result.status).toBe(1);
            expect(JSON.parse(result.stderr)).toMatchObject({
                ok: false,
                error: { code: 'UNKNOWN_COMMAND' },
            });
        }
    });
});

const createCliWorkspace = () => {
    const tempRoot = createTempDir('rankwrangler-cli-', TEMP_DIRS);
    const tempHome = path.join(tempRoot, 'home');
    const workspaceDir = path.join(tempRoot, 'workspace');
    mkdirSync(tempHome, { recursive: true });
    mkdirSync(workspaceDir, { recursive: true });
    return {
        cwd: workspaceDir,
        home: tempHome,
    };
};
