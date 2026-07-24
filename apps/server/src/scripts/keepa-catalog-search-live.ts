import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { searchKeepaCatalog } from '@/services/keepa-catalog-search';

const FIXED_QUERIES = ['retro gardening shirt'] as const;
const US_MARKETPLACE_ID = 'ATVPDKIKX0DER';

if (process.env.CI) {
    throw new Error('Live Keepa Catalog search is disabled in CI.');
}
if (process.env.RUN_LIVE_KEEPA_CATALOG_SEARCH !== '1') {
    throw new Error('Set RUN_LIVE_KEEPA_CATALOG_SEARCH=1 to authorize live Keepa usage.');
}

const shouldRecord = process.argv.includes('--record');
let totalTokensConsumed = 0;

for (const term of FIXED_QUERIES) {
    const result = await searchKeepaCatalog({
        marketplaceId: US_MARKETPLACE_ID,
        term,
    });
    totalTokensConsumed += result.internalUsage.tokensConsumed ?? 0;

    for (const product of result.products) {
        if (!product.asin || !/^[A-Z0-9]{10}$/.test(product.asin)) {
            throw new Error(`Keepa returned an invalid ASIN for "${term}".`);
        }
    }

    console.log(
        JSON.stringify({
            term,
            resultCount: result.products.length,
            tokensConsumed: result.internalUsage.tokensConsumed,
        })
    );

    if (shouldRecord) {
        const fixturePath = fileURLToPath(
            new URL(
                '../../test/fixtures/keepa-catalog-search/retro-gardening-shirt.json',
                import.meta.url
            )
        );
        await writeFile(
            fixturePath,
            `${JSON.stringify(
                {
                    capturedAt: new Date().toISOString(),
                    request: {
                        marketplaceId: US_MARKETPLACE_ID,
                        term,
                        page: 0,
                        history: true,
                        statsDays: 365,
                    },
                    response: {
                        products: result.products,
                        tokensConsumed: result.internalUsage.tokensConsumed,
                        tokensLeft: result.internalUsage.tokensLeft,
                        refillIn: result.internalUsage.refillInMs,
                        refillRate: result.internalUsage.refillRate,
                    },
                },
                null,
                4
            )}\n`
        );
    }
}

console.log(JSON.stringify({ totalTokensConsumed, recordingsUpdated: shouldRecord }));
