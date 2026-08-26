import {
    bootstrapDevAccessProjection,
    DEV_SIGN_IN_MERCHBASE_USER_ID,
} from '@merchbaseco/access/dev';
import { buildDatabaseUrl } from '@/config/database-url';
import { env } from '@/config/env';
import { db } from '@/db/index';
import { runMigrations } from '@/db/migrate';
import { assertLocalSeedTarget, describeTarget } from '@/dev-seed/local-database-guard';
import { buildDevSeedPlan, DEV_SEED_DEFAULTS } from '@/dev-seed/plan';
import { shiftDays, toDayLabel } from '@/dev-seed/time-offsets';
import { summarizePlan } from '@/dev-seed/types';
import { writeDevSeedPlan } from '@/dev-seed/write-plan';
import { createRankWranglerAccessProjectionStore } from '@/services/access/access-projection-store';
import { resolveRankWranglerServicePrincipal } from '@/services/access/rankwrangler-access';

/**
 * Fills a local database with a synthetic recent week so the dashboard opens on
 * something real, signed in as somebody real. Run it with `bun run db:seed:dev`.
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
 * 3. Grant the Dev Sign-In user access, before any product row exists. A
 *    product authorizes `api.app.*` against a webhook-synced Access Projection
 *    held in its own database, and a development database receives no Clerk
 *    webhooks — so without this every request 401s and a perfectly seeded
 *    catalog is invisible. It is the first thing that touches the database
 *    because a seeded week nobody can read is worth nothing.
 * 4. Clear the previous synthetic week and write the new one in one transaction.
 *
 * Every step prints what it did. A seed that quietly half-worked is the failure
 * mode this command exists to prevent.
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

    const access = await bootstrapAccess();

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

    printReceipt({ access, plan, summary, target: describeTarget(target), total });
};

/**
 * Writes the Access Projection the Clerk webhook would have written, through
 * the same store the webhook handler uses. `@merchbaseco/access` owns the Clerk
 * metadata, the event identity, and the refusals; this repository owns only the
 * issuer and the store, so no projection SQL is written by hand anywhere here.
 *
 * The issuer must be the one `createClerkAuthenticator` is configured with, or
 * the projection lands under an identity no session will ever match.
 *
 * The RankWrangler Service Account is minted here too. Nothing in the Product
 * catalog is owned per user — the synthetic week belongs to the database, not to
 * a seller — so the Service Account is the one row the seed can attach to the
 * signed-in user, and minting it now means the usage and API-access surfaces
 * open on a real account instead of one created by the first request.
 */
const bootstrapAccess = async () => {
    const result = await bootstrapDevAccessProjection({
        databaseUrl: buildDatabaseUrl(),
        issuer: env.MERCHBASE_CLERK_ISSUER,
        service: 'rankwrangler',
        store: createRankWranglerAccessProjectionStore(db),
    });

    console.log(
        `[Seed] Access projection: ${result.clerkSubject} @ ${result.issuer} -> ${result.merchbaseUserId} (granted)`
    );

    await resolveRankWranglerServicePrincipal(db, {
        merchbaseUserId: DEV_SIGN_IN_MERCHBASE_USER_ID,
    });
    console.log(`[Seed] Service account: ${DEV_SIGN_IN_MERCHBASE_USER_ID}`);

    return result;
};

const printReceipt = ({
    access,
    plan,
    summary,
    target,
    total,
}: {
    access: { clerkSubject: string; issuer: string; merchbaseUserId: string };
    plan: ReturnType<typeof buildDevSeedPlan>;
    summary: ReturnType<typeof summarizePlan>;
    target: string;
    total: number;
}) => {
    const { dayCount, now } = plan.options;
    const searchTerms = summary.topSearchTermsSnapshots + summary.topSearchTermsKeywordDaily;
    const logs = summary.eventLogs + summary.jobExecutionLogs + summary.providerAttempts;

    console.log('');
    console.log('[Seed] ─── Development seed receipt ───────────────────────────');
    console.log(`[Seed]   Database        ${target}`);
    console.log(
        `[Seed]   Signed-in user  ${access.merchbaseUserId} (Clerk ${access.clerkSubject} @ ${access.issuer})`
    );
    console.log(
        `[Seed]   Through day     ${toDayLabel(now)} (${dayCount} days from ${toDayLabel(
            shiftDays(now, -(dayCount - 1))
        )})`
    );
    console.log(`[Seed]   Products        ${summary.products}`);
    console.log(`[Seed]   Catalog queries ${summary.catalogQueries}`);
    console.log(`[Seed]   History points  ${summary.productHistoryPoints}`);
    console.log(`[Seed]   Search terms    ${searchTerms}`);
    console.log(`[Seed]   Log rows        ${logs}`);
    console.log(`[Seed]   Total rows      ${total}`);
    console.log('[Seed] ──────────────────────────────────────────────────────────');
    console.log('');
};

await main();
process.exit(0);
