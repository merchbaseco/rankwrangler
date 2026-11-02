import { PgBoss } from 'pg-boss';
import { buildDatabaseUrl } from '@/config/database-url';
import {
    RECLASSIFY_MERCH_LISTINGS_JOB,
    type ReclassifyMerchListingsInput,
} from '@/jobs/reclassify-merch-listings-input';

/**
 * Starts a Merch reclassification run: re-fetch every active US Product from SP-API and write the
 * current verdict, which promotes and demotes. It only queues the job; the server does the work
 * under its Catalog limiter, so the run never competes with the server's own calls. Run from
 * apps/server:
 *
 *   varlock run -p ../../.env.schema -- bun src/scripts/reclassify-merch-listings.ts --dry-run
 *
 * Flags: `--dry-run` tallies transitions without writing; `--after <ASIN>` resumes after an ASIN;
 * `--limit <n>` stops after n Products. Progress and totals are each chunk's job output.
 */
const main = async () => {
    const args = process.argv.slice(2);
    const limitValue = readFlag(args, '--limit');
    const limit = limitValue === null ? null : Number.parseInt(limitValue, 10);
    if (limit !== null && !(limit > 0)) throw new Error('--limit must be a positive integer');
    const input: ReclassifyMerchListingsInput = {
        afterAsin: readFlag(args, '--after') ?? '',
        dryRun: args.includes('--dry-run'),
        remaining: limit,
        checked: 0,
        transitions: {},
    };

    const boss = new PgBoss({
        connectionString: buildDatabaseUrl(),
        migrate: false,
        schedule: false,
        supervise: false,
    });
    await boss.start();
    try {
        const id = await boss.send(RECLASSIFY_MERCH_LISTINGS_JOB, input, {
            singletonKey: RECLASSIFY_MERCH_LISTINGS_JOB,
        });
        console.log(
            id
                ? `[Reclassify] Queued ${input.dryRun ? 'dry run' : 'run'} ${id}: ${JSON.stringify(input)}`
                : '[Reclassify] A run is already queued; nothing sent'
        );
    } finally {
        await boss.stop();
    }
};

const readFlag = (args: string[], flag: string) => {
    const index = args.indexOf(flag);
    return index === -1 ? null : (args[index + 1] ?? null);
};

// Not awaited at top level: the built script lazily imports modules that must finish evaluating
// first, and a top-level await would hold their evaluation until main returned.
main().then(
    () => process.exit(0),
    error => {
        console.error(error);
        process.exit(1);
    }
);
