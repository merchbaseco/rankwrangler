import postgres from 'postgres';
import { applyRankWranglerCutoverPlan, loadRankWranglerCutoverPlan } from './central-auth-cutover';
import { fingerprint, parseCutoverOptions, RANKWRANGLER_SERVICE } from './central-auth-cutover-lib';

const issuer = process.env.MERCHBASE_CLERK_ISSUER?.trim();

if (!issuer) {
    console.error('Central auth cutover blocked: MERCHBASE_CLERK_ISSUER is required.');
    process.exit(1);
}

const createClient = () =>
    postgres({
        host: process.env.RANKWRANGLER_DATABASE_HOST || 'postgres',
        port: Number(process.env.RANKWRANGLER_DATABASE_PORT || 5432),
        database: process.env.RANKWRANGLER_DATABASE_NAME || 'rankwrangler',
        username: process.env.RANKWRANGLER_DATABASE_USER || 'rankwrangler',
        password: process.env.RANKWRANGLER_DATABASE_PASSWORD || 'SecurePass123',
        max: 1,
    });

const printPlan = (plan: Awaited<ReturnType<typeof loadRankWranglerCutoverPlan>>['plan']) => {
    console.log(
        JSON.stringify(
            {
                mode: 'dry-run',
                service: RANKWRANGLER_SERVICE,
                legacyLicenseFingerprint: plan.legacyLicenseFingerprint,
                clerkIdentityFingerprint: plan.clerkIdentityFingerprint,
                merchbaseUserFingerprint: plan.merchbaseUserFingerprint,
                serviceAccountFingerprint: plan.serviceAccountFingerprint,
                metering: plan.metering,
                planDigest: plan.planDigest,
            },
            null,
            2
        )
    );
};

const main = async () => {
    const options = parseCutoverOptions(process.argv.slice(2));
    const sql = createClient();

    try {
        const { plan } = await loadRankWranglerCutoverPlan(sql, options, issuer);
        printPlan(plan);
        if (options.confirm) {
            await applyRankWranglerCutoverPlan(sql, options, plan, issuer);
            console.log(
                JSON.stringify({ mode: 'approved', planDigest: fingerprint(plan.planDigest) })
            );
        }
    } finally {
        await sql.end();
    }
};

main().catch(error => {
    console.error(
        `Central auth cutover blocked: ${error instanceof Error ? error.message : 'preflight failed.'}`
    );
    process.exitCode = 1;
});
