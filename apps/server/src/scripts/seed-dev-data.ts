import { env } from '@/config/env';
import { runMigrations } from '@/db/migrate';
import { assertLocalSeedTarget, describeTarget } from '@/dev-seed/local-database-guard';
import { buildDevSeedPlan, DEV_SEED_DEFAULTS } from '@/dev-seed/plan';
import { summarizePlan } from '@/dev-seed/types';
import { writeDevSeedPlan } from '@/dev-seed/write-plan';

/**
 * Fills a local database with a synthetic recent week so the dashboard opens on
 * something real. Run it with `bun run db:seed:dev`.
 *
 * Order is deliberate:
 *
 * 1. Refuse anything that is not a loopback database. This happens before the
 *    migration, before the connection, and before any row is touched.
 * 2. Migrate to `latest`. The environment contract still points development at
 *    the guarded `pre-cutover` target, which stops eight migrations short of the
 *    schema the application actually queries, so a freshly created development
 *    database cannot serve the catalog at all. The seed brings it current
 *    itself rather than leaving a developer to discover a missing column.
 * 3. Clear the previous synthetic week and write the new one in one transaction.
 */

const main = async () => {
    const target = assertLocalSeedTarget({
        database: env.RANKWRANGLER_DATABASE_NAME,
        host: env.RANKWRANGLER_DATABASE_HOST,
        nodeEnv: process.env.NODE_ENV,
        port: env.RANKWRANGLER_DATABASE_PORT,
    });

    console.log(`[Seed] Target ${describeTarget(target)}`);
    console.log(`[Seed] Seed "${DEV_SEED_DEFAULTS.seed}", anchored to now.`);

    await runMigrations(process.env.MIGRATIONS_FOLDER ?? './drizzle', 'latest');

    const startedAt = Date.now();
    const plan = buildDevSeedPlan();
    const report = await writeDevSeedPlan(plan);
    const summary = summarizePlan(plan);
    const total = Object.values(summary).reduce((sum, count) => sum + count, 0);

    for (const [table, count] of Object.entries(summary)) {
        console.log(`[Seed]   ${table.padEnd(28)} ${String(count).padStart(6)}`);
    }
    console.log(
        `[Seed] Cleared ${report.cleared} previously seeded rows, wrote ${total} in ${
            Date.now() - startedAt
        }ms.`
    );
};

await main();
process.exit(0);
