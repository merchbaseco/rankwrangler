import { sql } from 'drizzle-orm';
import type { db } from './index';

export const lockKeywordScheduling = async (
    transaction: Parameters<Parameters<typeof db.transaction>[0]>[0]
) => await transaction.execute(sql`select pg_advisory_xact_lock(hashtext('keyword-admission'))`);
