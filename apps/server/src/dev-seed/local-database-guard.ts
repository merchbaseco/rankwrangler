/**
 * The dev seed fabricates Products, Search runs, keyword snapshots, and activity
 * events, then clears and refills them. "Not production" is not a safe test for
 * where that may run: RANKWRANGLER_DATABASE_HOST is an ordinary environment
 * variable, so a shell that exported the production value, or a `VARLOCK_ENV=production`
 * invocation, would otherwise point a destructive write at the live database.
 *
 * The only structurally safe target is a PostgreSQL listening on this machine,
 * so the guard allows loopback and refuses every other host, including every
 * name that could resolve off-box. There is no override.
 */

const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', '::1', 'localhost']);
const IPV6_BRACKETS = /^\[|\]$/gu;

export interface SeedDatabaseTarget {
    readonly database: string;
    readonly host: string;
    readonly port: string;
}

export class SeedTargetRefusedError extends Error {
    constructor(reason: string, target: string) {
        super(
            [
                'Refusing to seed: the dev seed only runs against a local database.',
                `Reason: ${reason}`,
                `Target: ${target}`,
                'RANKWRANGLER_DATABASE_HOST must be 127.0.0.1, ::1, or localhost.',
                'There is no override flag. Start a local PostgreSQL and point the run at it:',
                '  bun run --filter @rankwrangler/server exec docker compose -f compose.yml up -d postgres',
            ].join('\n')
        );
        this.name = 'SeedTargetRefusedError';
    }
}

/**
 * Returns the target to seed, or throws. Pure over its inputs: no environment
 * reads, no connection attempt, so the caller can prove the refusals in a test.
 */
export const assertLocalSeedTarget = (input: {
    readonly host: string | undefined;
    readonly port: number | string | undefined;
    readonly database: string | undefined;
    readonly nodeEnv?: string;
}): SeedDatabaseTarget => {
    const target: SeedDatabaseTarget = {
        database: input.database?.trim() || '(none)',
        host: normalizeHost(input.host),
        port: String(input.port ?? '').trim() || '5432',
    };

    if (input.nodeEnv === 'production') {
        throw new SeedTargetRefusedError('NODE_ENV is production', describeTarget(target));
    }

    if (target.host === '') {
        throw new SeedTargetRefusedError(
            'RANKWRANGLER_DATABASE_HOST is unset',
            describeTarget(target)
        );
    }

    if (!LOOPBACK_HOSTNAMES.has(target.host)) {
        throw new SeedTargetRefusedError(
            `database host ${target.host} is not loopback`,
            describeTarget(target)
        );
    }

    return target;
};

export const describeTarget = (target: SeedDatabaseTarget) =>
    `${target.host}:${target.port}/${target.database}`;

const normalizeHost = (host: string | undefined) =>
    (host ?? '').trim().replace(IPV6_BRACKETS, '').toLowerCase();
