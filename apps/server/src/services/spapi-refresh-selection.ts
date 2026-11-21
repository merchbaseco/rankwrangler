import { and, asc, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import {
    spApiBlindspotDueAt,
    spApiBlindspotTracked,
    spApiRefreshDueAt,
    spApiRefreshTracked,
} from '@/db/product-refresh-due';
import { products } from '@/db/schema';

// One ten-minute run lists at most this many BSR-tier refreshes, most overdue first: about six
// times the steady-state due count, and roughly what the SP-API queue drains in that time, so a
// backlog after a pause drains over successive runs instead of in one unbounded statement.
// Blindspots (NULL-BSR active Merch + Keepa-only non-Merch) scale to ~13k/day in steady state,
// so 350/run (~18 batched background calls every 10 min) keeps probation and 30-day checks current.
export const SPAPI_REFRESH_BATCH = 2000;
export const SPAPI_BLINDSPOT_BATCH = 350;

type DueProduct = { marketplaceId: string; asin: string };

/** BSR-tier SP-API refreshes that are due, most overdue first (`products_spapi_refresh_due_idx`). */
export const listDueSpApiRefreshes = async (
    now: Date,
    limit = SPAPI_REFRESH_BATCH
): Promise<DueProduct[]> =>
    await db
        .select({ marketplaceId: products.marketplaceId, asin: products.asin })
        .from(products)
        .where(
            and(
                spApiRefreshTracked(products),
                sql`${spApiRefreshDueAt(products)} < ${now.toISOString()}::timestamp`
            )
        )
        .orderBy(spApiRefreshDueAt(products), asc(products.id))
        .limit(limit);

/** No-BSR and Keepa-only Products due a bounded SP-API check (`products_spapi_blindspot_due_idx`). */
export const listDueSpApiBlindspots = async (
    now: Date,
    limit = SPAPI_BLINDSPOT_BATCH
): Promise<DueProduct[]> =>
    await db
        .select({ marketplaceId: products.marketplaceId, asin: products.asin })
        .from(products)
        .where(
            and(
                spApiBlindspotTracked(products),
                sql`${spApiBlindspotDueAt(products)} <= ${now.toISOString()}::timestamp`
            )
        )
        .orderBy(spApiBlindspotDueAt(products), asc(products.createdAt), asc(products.id))
        .limit(limit);
