import {
    backfillProductHistorySeries,
    countProductsMissingHistorySeries,
} from '@/db/product/backfill-product-history-series';

/**
 * One-off: convert `product_history_points` rows into compact `product_history_series`, after
 * the deploy that writes and reads series. Run from apps/server against the target database:
 *
 *   varlock run -p ../../.env.schema -- bun src/scripts/backfill-product-history-series.ts
 *
 * Flags: `--after <productId>` resumes after a Product id (each batch logs its cursor);
 * `--batch <n>` Products per statement (default 25); `--limit <n>` stops after n Products. Safe
 * to re-run: batches merge into existing series, and series a fresh Keepa fetch wrote keep their
 * values. Delete this script with the migration that drops `product_history_points`.
 */
const main = async () => {
    const args = process.argv.slice(2);
    const afterProductId = readFlag(args, '--after') ?? undefined;
    const batchSize = readPositiveInteger(args, '--batch') ?? 25;
    const limit = readPositiveInteger(args, '--limit');

    console.log(
        `[History backfill] Converting Products after ${afterProductId ?? 'the start'}, ` +
            `${batchSize} per batch${limit ? `, limit ${limit}` : ''}`
    );
    const startedAt = Date.now();
    const result = await backfillProductHistorySeries({
        afterProductId,
        batchSize,
        limit,
        log: message => console.log(`[History backfill] ${message}`),
    });
    const missing = await countProductsMissingHistorySeries();
    console.log(
        `[History backfill] Done in ${Math.round((Date.now() - startedAt) / 1000)}s: ` +
            `${result.products} Products, ${result.seriesWritten} series; ` +
            `${missing} Products with points still lack series`
    );
};

const readFlag = (args: string[], flag: string) => {
    const index = args.indexOf(flag);
    return index === -1 ? null : (args[index + 1] ?? null);
};

const readPositiveInteger = (args: string[], flag: string) => {
    const value = readFlag(args, flag);
    if (value === null) return null;
    const parsed = Number.parseInt(value, 10);
    if (!(parsed > 0)) throw new Error(`${flag} must be a positive integer`);
    return parsed;
};

await main();
process.exit(0);
