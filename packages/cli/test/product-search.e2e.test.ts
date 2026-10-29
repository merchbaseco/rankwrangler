import { afterEach, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { serve } from 'bun';
import { createTempDir, runCliFailure, spawnCliAsync } from './test-helpers';

const tempDirs: string[] = [];
const port = Number(
    execFileSync('dev-port', ['--group'], { encoding: 'utf8' }).trim().split(/\s+/)[0]
);
afterEach(() => {
    for (const directory of tempDirs.splice(0)) rmSync(directory, { recursive: true, force: true });
});

test('Product search uses database query filters and opaque pagination without provider refresh', async () => {
    const requests: Array<{ method: string; input: unknown }> = [];
    const server = serve({
        port,
        fetch(request) {
            const url = new URL(request.url);
            expect(url.pathname).toContain('product.search');
            const input = JSON.parse(url.searchParams.get('input') ?? '{}')['0'];
            requests.push({ method: request.method, input });
            return Response.json([
                {
                    result: {
                        data: { items: [{ asin: 'B012345678' }], nextCursor: 'next-page' },
                    },
                },
            ]);
        },
    });
    const workspace = createWorkspace();
    try {
        const result = await spawnCliAsync(
            [
                'product',
                'search',
                'fishing',
                '--maxBsr',
                '300000',
                '--minPrice',
                '1599',
                '--sort',
                'firstAvailableAtDesc',
                '--limit',
                '20',
                '--cursor',
                'opaque-cursor',
                '--availableAfter',
                '2026-09-01',
                '--textFields',
                'title',
                '--excludeWord',
                'youth',
                '--excludeWord',
                'kids',
                '--brand',
                'Fishing Co',
                '--facet',
                'audience=adults',
                '--includeOfficialBrands',
                '--baseUrl',
                `http://127.0.0.1:${server.port}`,
            ],
            workspace
        );
        expect(result.status).toBe(0);
        expect(JSON.parse(result.stdout)).toEqual({
            ok: true,
            data: { items: [{ asin: 'B012345678' }], nextCursor: 'next-page' },
        });
        expect(requests).toEqual([
            {
                method: 'GET',
                input: {
                    term: 'fishing',
                    marketplaceIds: ['ATVPDKIKX0DER'],
                    textFields: 'title',
                    excludeWords: ['youth', 'kids'],
                    brands: ['Fishing Co'],
                    facets: [{ facet: 'audience', name: 'adults' }],
                    includeOfficialBrands: true,
                    salesRank: { max: 300000 },
                    price: { min: 1599 },
                    firstAvailableAt: { after: '2026-09-01T00:00:00.000Z' },
                    sort: 'firstAvailableAtDesc',
                    limit: 20,
                    cursor: 'opaque-cursor',
                },
            },
        ]);
        requests.length = 0;
        const browse = await spawnCliAsync(
            [
                'product',
                'search',
                '--merch',
                'all',
                '--marketplace',
                'TEST',
                '--baseUrl',
                `http://127.0.0.1:${server.port}`,
            ],
            workspace
        );
        expect(browse.status).toBe(0);
        expect(requests).toEqual([
            {
                method: 'GET',
                input: { marketplaceIds: ['TEST'], isMerchListing: 'all' },
            },
        ]);
    } finally {
        server.stop(true);
    }
});

test('Product search rejects malformed filters before a request', () => {
    const workspace = createWorkspace();
    for (const args of [
        ['--maxBsr', '12oops'],
        ['--minBsr', '20', '--maxBsr', '10'],
        ['--limit', '101'],
        ['--sort', 'magic'],
        ['--facet', 'missing-name'],
        ['--availableAfter', 'yesterday'],
        ['--availableAfter', '2026-02-31'],
        ['--availableAfter', '2026-10-01', '--availableBefore', '2026-09-01'],
    ]) {
        expect(runCliFailure(['product', 'search', ...args], workspace)).toMatchObject({
            ok: false,
            error: { code: 'INVALID_INPUT' },
        });
    }
});

const createWorkspace = () => {
    const root = createTempDir('rankwrangler-search-cli-', tempDirs);
    const home = path.join(root, 'home');
    mkdirSync(home);
    return { cwd: root, home, env: { MERCHBASE_API_KEY: 'ak_test_value' } };
};
