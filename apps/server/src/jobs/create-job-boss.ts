import { PgBoss } from 'pg-boss';
import { buildDatabaseUrl } from '@/config/database-url';

/**
 * pg-boss reaches PostgreSQL directly, not through the pooler, and the database allows 25
 * connections with three reserved for superusers. Five connections cover worker polling, sends
 * and maintenance (pg-boss's default is ten, all of which production held open); with the
 * realtime listener that is six direct connections per server beside the pooler's share.
 * Maintenance deletes finished jobs hourly instead of daily, so rows leave soon after their
 * one-day retention (see ensureJobRetention).
 */
export const JOB_BOSS_POOL_SIZE = 5;

export const createJobBoss = () =>
    new PgBoss({
        connectionString: buildDatabaseUrl(),
        max: JOB_BOSS_POOL_SIZE,
        maintenanceIntervalSeconds: 3600,
    });
