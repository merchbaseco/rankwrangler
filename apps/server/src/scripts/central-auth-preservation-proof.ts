import { readFile, writeFile } from 'node:fs/promises';
import postgres from 'postgres';
import { fingerprint } from './central-auth-cutover-lib';
import {
    assertPreservation,
    type PreservationManifest,
} from './central-auth-preservation-proof-lib';

interface Options {
    legacyLicenseId: string;
    manifestPath: string;
    phase: 'after' | 'before';
    serviceAccountId: string;
}

const parseOptions = (args: string[]): Options => {
    const values = new Map(
        args.map(arg => {
            const separator = arg.indexOf('=');
            if (!arg.startsWith('--') || separator < 0) {
                throw new Error(`Expected --name=value: ${arg}`);
            }
            return [arg.slice(2, separator), arg.slice(separator + 1).trim()];
        })
    );
    const phase = values.get('phase');
    if (phase !== 'before' && phase !== 'after') {
        throw new Error('--phase must be before or after.');
    }
    const legacyLicenseId = values.get('legacy-license-id');
    const manifestPath = values.get('manifest');
    const serviceAccountId = values.get('service-account-id');
    if (!(legacyLicenseId && manifestPath && serviceAccountId)) {
        throw new Error('--legacy-license-id, --service-account-id, and --manifest are required.');
    }
    return { legacyLicenseId, manifestPath, phase, serviceAccountId };
};

const createClient = () => {
    const connectionString = process.env.DATABASE_URL?.trim();
    if (connectionString) {
        return postgres(connectionString, { max: 1 });
    }
    return postgres({
        host: process.env.DATABASE_HOST || 'postgres',
        port: Number(process.env.DATABASE_PORT || 5432),
        database: process.env.DATABASE_NAME || 'rankwrangler',
        username: process.env.DATABASE_USER || 'rankwrangler',
        password: process.env.DATABASE_PASSWORD || 'SecurePass123',
        max: 1,
    });
};

const capture = async (sql: postgres.Sql, options: Options): Promise<PreservationManifest> => {
    const collections = {
        catalogQueries: await captureCollection(
            sql,
            'catalog_queries',
            'to_jsonb(catalog_queries)::text'
        ),
        catalogSearchResults: await captureCollection(
            sql,
            'catalog_search_results',
            'to_jsonb(catalog_search_results)::text'
        ),
        catalogSearchRuns: await captureCollection(
            sql,
            'catalog_search_runs',
            'to_jsonb(catalog_search_runs)::text'
        ),
        operations: await captureCollection(sql, 'operations', 'to_jsonb(operations)::text'),
        productHistoryImports: await captureCollection(
            sql,
            'product_history_imports',
            'to_jsonb(product_history_imports)::text'
        ),
        productHistoryPoints: await captureCollection(
            sql,
            'product_history_points',
            'to_jsonb(product_history_points)::text'
        ),
        // Normalize additive listing resolution state so schema evolution is not treated as data loss.
        products: await captureCollection(
            sql,
            'products',
            options.phase === 'before'
                ? "((to_jsonb(products) - 'sp_api_resolved_at') || jsonb_build_object('amazon_listing_status', 'active'))::text"
                : "(to_jsonb(products) - 'sp_api_resolved_at')::text"
        ),
    };

    if (options.phase === 'before') {
        const legacy = await sql<
            Array<{
                id: string;
                lastResetAt: Date;
                lastUsedAt: Date | null;
                usageCount: number;
                usageToday: number;
                usageLimit: number;
            }>
        >`
            select
                id,
                "lastResetAt" as "lastResetAt",
                "lastUsedAt" as "lastUsedAt",
                "usageCount" as "usageCount",
                "usageToday" as "usageToday",
                "usageLimit" as "usageLimit"
            from licenses
            where id = ${options.legacyLicenseId}
            limit 2
        `;
        if (legacy.length !== 1 || !legacy[0]) {
            throw new Error('The exact legacy license row was not found.');
        }
        return {
            collections,
            legacyLicense: {
                fingerprint: fingerprint(legacy[0].id),
                lastResetAt: legacy[0].lastResetAt.toISOString(),
                lastUsedAt: legacy[0].lastUsedAt?.toISOString() ?? null,
                usageCount: legacy[0].usageCount,
                usageLimit: legacy[0].usageLimit,
                usageToday: legacy[0].usageToday,
            },
            serviceAccount: { fingerprint: fingerprint(options.serviceAccountId) },
            version: 2,
        };
    }

    const accounts = await sql<
        Array<{
            lastResetAt: Date;
            lastUsedAt: Date | null;
            usageCount: number;
            usageToday: number;
            usageLimit: number;
        }>
    >`
        select
            last_reset_at as "lastResetAt",
            last_used_at as "lastUsedAt",
            usage_count as "usageCount",
            usage_today as "usageToday",
            usage_limit as "usageLimit"
        from rankwrangler_service_accounts
        where service = 'rankwrangler' and id = ${options.serviceAccountId}
        limit 2
    `;
    if (accounts.length !== 1 || !accounts[0]) {
        throw new Error('The requested RankWrangler service account was not found exactly once.');
    }

    return {
        collections,
        legacyLicense: {
            fingerprint: fingerprint(options.legacyLicenseId),
            lastResetAt: accounts[0].lastResetAt.toISOString(),
            lastUsedAt: accounts[0].lastUsedAt?.toISOString() ?? null,
            usageCount: accounts[0].usageCount,
            usageLimit: accounts[0].usageLimit,
            usageToday: accounts[0].usageToday,
        },
        serviceAccount: { fingerprint: fingerprint(options.serviceAccountId) },
        version: 2,
    };
};

const captureCollection = async (sql: postgres.Sql, table: string, rowExpression: string) => {
    const [row] = await sql.unsafe<Array<{ count: number; fingerprint: string }>>(`
        select
            count(*)::bigint as count,
            md5(
                coalesce(string_agg(md5(${rowExpression}), '|' order by id::text), '')
            ) as fingerprint
        from ${table}
    `);
    if (!row) {
        throw new Error(`Unable to capture ${table}.`);
    }
    return { count: Number(row.count), fingerprint: row.fingerprint };
};

const main = async () => {
    const options = parseOptions(process.argv.slice(2));
    const sql = createClient();
    try {
        const manifest = await capture(sql, options);
        if (options.phase === 'before') {
            await writeFile(options.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
            console.log(
                JSON.stringify({ phase: 'before', manifestFingerprint: fingerprint(manifest) })
            );
            return;
        }

        const before = JSON.parse(
            await readFile(options.manifestPath, 'utf8')
        ) as PreservationManifest;
        assertPreservation(before, manifest);
        console.log(JSON.stringify({ phase: 'after', preserved: true }));
    } finally {
        await sql.end();
    }
};

main().catch(error => {
    console.error(
        `Central-auth preservation proof failed: ${error instanceof Error ? error.message : 'verification failed.'}`
    );
    process.exitCode = 1;
});
