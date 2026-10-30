import { sql } from 'drizzle-orm';
import { products } from '@/db/product-schema';

/** The ASIN Keepa is asked about for a stored family: its representative variant, else itself. */
export const keepaRequestAsin = sql<string>`coalesce(${products.representativeAsin}, ${products.asin})`;
