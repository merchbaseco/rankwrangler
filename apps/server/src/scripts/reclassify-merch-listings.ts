import { and, asc, eq, gt, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { upsertProductsInfo } from '@/db/product/upsert-product';
import { products } from '@/db/product-schema';
import { reclassifyMerchListings } from '@/services/merch-reclassification';
import { searchCatalogItemsByAsins } from '@/services/spapi/search-catalog-items-by-asins';

/**
 * One-off: re-fetch active US Products from SP-API and reclassify Merch listings with the current
 * classifier. Run from apps/server:
 *
 *   varlock run -p ../../.env.schema -- bun src/scripts/reclassify-merch-listings.ts --dry-run
 *
 * Flags: `--dry-run` tallies flips without writing; `--demote` re-checks only stored Merch and
 * clears it where fresh evidence is non-Merch; `--include-merch` also re-fetches Products
 * already known as Merch (refreshing seller bullets); `--after <ASIN>` resumes after an ASIN;
 * `--limit <n>` stops after n Products. Requests use background Catalog capacity, so the script
 * yields to foreground lookups and waits while automatic sync is paused.
 */
const US_MARKETPLACE_ID = 'ATVPDKIKX0DER';

const main = async () => {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');
    const demote = args.includes('--demote');
    const includeMerch = args.includes('--include-merch');
    const afterAsin = readFlag(args, '--after') ?? '';
    const limitValue = readFlag(args, '--limit');
    const limit = limitValue === null ? null : Number.parseInt(limitValue, 10);
    if (limit !== null && !(limit > 0)) throw new Error('--limit must be a positive integer');

    console.log(
        `[Reclassify] ${dryRun ? 'Dry run' : 'Writing'}: US Products after "${afterAsin}"` +
            `${includeMerch ? ', including known Merch' : ''}${demote ? ', demoting known Merch only' : ''}` +
            `${limit ? `, limit ${limit}` : ''}`
    );
    const result = await reclassifyMerchListings(
        { afterAsin, limit, dryRun, demote },
        {
            readBatch: async (after, size) =>
                await db
                    .select({ asin: products.asin, isMerchListing: products.isMerchListing })
                    .from(products)
                    .where(
                        and(
                            eq(products.marketplaceId, US_MARKETPLACE_ID),
                            eq(products.amazonListingStatus, 'active'),
                            gt(products.asin, after),
                            demote
                                ? sql`${products.isMerchListing} is true`
                                : includeMerch
                                  ? undefined
                                  : sql`${products.isMerchListing} is not true`
                        )
                    )
                    .orderBy(asc(products.asin))
                    .limit(size),
            fetchProducts: async asins =>
                await searchCatalogItemsByAsins(US_MARKETPLACE_ID, asins, {
                    priority: 'background',
                }),
            writeProducts: async fetched => {
                await upsertProductsInfo(fetched);
            },
            demoteProducts: async asins => {
                await db
                    .update(products)
                    .set({ isMerchListing: false, bullet1: null, bullet2: null })
                    .where(
                        and(
                            eq(products.marketplaceId, US_MARKETPLACE_ID),
                            inArray(products.asin, asins)
                        )
                    );
            },
            sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
            log: message => console.log(`[Reclassify] ${message}`),
        }
    );
    console.log(`[Reclassify] ${dryRun ? 'Would apply' : 'Applied'} transitions (before->after):`);
    for (const [transition, count] of Object.entries(result.transitions).sort())
        console.log(`[Reclassify]   ${transition.padEnd(22)} ${count}`);
    console.log(`[Reclassify] Checked ${result.checked}; resume with --after ${result.lastAsin}`);
};

const readFlag = (args: string[], flag: string) => {
    const index = args.indexOf(flag);
    return index === -1 ? null : (args[index + 1] ?? null);
};

await main();
process.exit(0);
