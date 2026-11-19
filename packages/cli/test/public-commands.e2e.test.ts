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
    test('routes one or many Product get ASINs to the matching public contract', async () => {
        const requests: Array<{
            procedure: string;
            input: Record<string, unknown>;
        }> = [];
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

                if (procedure === 'getMany') {
                    return Response.json([
                        {
                            result: {
                                data: [
                                    {
                                        marketplaceId: 'ATVPDKIKX0DER',
                                        asin: 'B012345678',
                                        title: 'Garden shirt',
                                        imageUrl: null,
                                        amazonListingStatus: 'active',
                                    },
                                    {
                                        marketplaceId: 'ATVPDKIKX0DER',
                                        asin: 'B087654321',
                                        title: null,
                                        imageUrl: null,
                                        amazonListingStatus: 'deleted',
                                    },
                                ],
                            },
                        },
                    ]);
                }

                if (procedure === 'get') {
                    return Response.json([
                        {
                            result: {
                                data: {
                                    marketplaceId: 'ATVPDKIKX0DER',
                                    asin: 'B012345678',
                                    listing: {
                                        title: null,
                                        shortName: null,
                                        brand: null,
                                        firstAvailableAt: null,
                                        bulletPoints: [],
                                        imageUrl: null,
                                        isMerchListing: false,
                                        amazonListingStatus: 'active',
                                    },
                                    category: null,
                                    salesRank: null,
                                    salesRankAverages: { last30Days: null, last90Days: null },
                                    price: null,
                                    boughtInPastMonth: null,
                                    estimatedMonthlySales: null,
                                    salesRankDrops: {
                                        last30Days: null,
                                        last90Days: null,
                                        last180Days: null,
                                        last365Days: null,
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
            const getResult = await spawnCliAsync(['product', 'get', 'B012345678', ...baseArgs], {
                ...workspace,
                env: { MERCHBASE_API_KEY: 'ak_test_value' },
            });
            const shortNameResult = await spawnCliAsync(
                ['product', 'get', 'B012345678', '--shortName', ...baseArgs],
                { ...workspace, env: { MERCHBASE_API_KEY: 'ak_test_value' } }
            );
            const getManyResult = await spawnCliAsync(
                ['product', 'get', 'b012345678', 'B087654321', ...baseArgs],
                {
                    ...workspace,
                    env: { MERCHBASE_API_KEY: 'ak_test_value' },
                }
            );
            const historyResult = await spawnCliAsync(
                ['product', 'history', 'B012345678', ...baseArgs],
                { ...workspace, env: { MERCHBASE_API_KEY: 'ak_test_value' } }
            );

            expect(getResult.status).toBe(0);
            expect(shortNameResult.status).toBe(0);
            expect(getManyResult.status).toBe(0);
            expect(historyResult.status).toBe(0);
            expect(JSON.parse(getManyResult.stdout)).toMatchObject({
                ok: true,
                data: [
                    {
                        asin: 'B012345678',
                        amazonListingStatus: 'active',
                        title: 'Garden shirt',
                    },
                    { asin: 'B087654321', amazonListingStatus: 'deleted', title: null },
                ],
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
                    procedure: 'get',
                    input: {
                        marketplaceId: 'ATVPDKIKX0DER',
                        asin: 'B012345678',
                        include: ['marketData', 'shortName'],
                    },
                },
                {
                    procedure: 'getMany',
                    input: {
                        asins: ['B012345678', 'B087654321'],
                        marketplaceId: 'ATVPDKIKX0DER',
                    },
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

    test('runs keyword directory get and list with final output data', async () => {
        const requests: string[] = [];
        const inputs: unknown[] = [];
        const server = serve({
            port: CLI_TEST_SERVER_PORT,
            fetch(request) {
                const url = new URL(request.url);
                const procedure = url.pathname.split('.').at(-1) ?? '';
                requests.push(procedure);
                inputs.push(JSON.parse(url.searchParams.get('input') ?? '{}')['0']);
                let data: Record<string, unknown>;
                if (procedure === 'get') {
                    data = {
                        keyword: 'garden shirt',
                        status: 'empty',
                        current: null,
                    };
                } else if (procedure === 'list') {
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
                ['keyword', 'list', 'garden shirt', '--stage', 'trial', ...baseArgs],
            ]) {
                const result = await spawnCliAsync(args, {
                    ...workspace,
                    env: { MERCHBASE_API_KEY: 'ak_test_value' },
                });
                expect(result.status).toBe(0);
            }
            expect(requests).toEqual(['get', 'list']);
            expect(inputs[1]).toMatchObject({ term: 'garden shirt', stage: 'trial' });
            const invalid = await spawnCliAsync(
                ['keyword', 'list', 'garden shirt', '--stage', 'queued', ...baseArgs],
                { ...workspace, env: { MERCHBASE_API_KEY: 'ak_test_value' } }
            );
            expect(invalid.status).not.toBe(0);
            expect(requests).toHaveLength(2);
        } finally {
            server.stop(true);
        }
    });

    test('rejects removed options as invalid input', () => {
        const workspace = createCliWorkspace();
        const commands = [
            ['product', 'get', 'B012345678', '--refresh'],
            ['keyword', 'get', 'garden shirt', '--refresh'],
            ['product', 'search', 'shirt', '--textFields', 'title'],
            ['product', 'search', 'shirt', '--minMonthlySold', '50'],
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

    test('rejects invalid Product get batches before making a request', () => {
        const workspace = createCliWorkspace();
        const commands = [
            ['product', 'get'],
            ['product', 'get', 'B012345678', 'b012345678'],
            [
                'product',
                'get',
                ...Array.from({ length: 201 }, (_, index) => `B${String(index).padStart(9, '0')}`),
            ],
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

    test('rejects superseded plural, Catalog, Operation and keyword commands', () => {
        const workspace = createCliWorkspace();
        const commands = [
            ['keyword', 'results', 'retro gardening shirt'],
            ['keyword', 'search', 'retro gardening'],
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
