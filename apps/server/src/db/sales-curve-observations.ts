import { sql } from 'drizzle-orm';
import type { SalesObservation } from '@/services/sales-curve-fit';
import { db } from './index';
import { products } from './product-schema';

/** Clothing, Shoes & Jewelry: the root category Merch shirts rank in. */
export const MERCH_ROOT_CATEGORY_ID = 7_141_123_011;
/** Keepa reads older than this describe a past season, so the fit leaves them out. */
export const SALES_CURVE_WINDOW_DAYS = 30;
/** Log-rank bins per unit of ln(BSR): a bin spans about 13%, noise beside the fit's spread. */
const BINS_PER_LOG = 8;
const DAY_MS = 86_400_000;

/**
 * The sold badge against Keepa's current rank from the same read, counted per log-rank bin, over
 * active Merch listings in Clothing whose Keepa read is under SALES_CURVE_WINDOW_DAYS old. The
 * estimate is asked what a listing ranked here now sells; the 30-day average lags an in-season
 * surge and overstated current ranks by up to 9x. A Product Keepa has not read says nothing about
 * its badge, so only Keepa-read Products count; a missing badge on one of them means under 50 a
 * month.
 */
export const readSalesCurveObservations = async (
    marketplaceId: string,
    now = new Date()
): Promise<SalesObservation[]> => {
    const since = new Date(now.getTime() - SALES_CURVE_WINDOW_DAYS * DAY_MS).toISOString();
    const rows = await db.execute<{ bin: number; sold: number | null; count: number }>(sql`
        select round(ln(${products.keepaCurrentBsr}) * ${sql.raw(String(BINS_PER_LOG))})::int bin,
            ${products.keepaMonthlySold} sold, count(*)::int count
        from ${products}
        where ${products.marketplaceId} = ${marketplaceId}
            and ${products.isMerchListing} = true
            and ${products.amazonListingStatus} = 'active'
            and ${products.rootCategoryId} = ${MERCH_ROOT_CATEGORY_ID}
            and ${products.keepaFetchedAt} >= ${since}::timestamp
            and ${products.keepaCurrentBsr} > 0
        group by 1, 2`);
    return rows.map(row => ({
        bsr: Math.exp(row.bin / BINS_PER_LOG),
        sold: row.sold,
        count: row.count,
    }));
};
