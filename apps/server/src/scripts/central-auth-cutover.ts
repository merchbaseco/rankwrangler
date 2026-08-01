import type postgres from 'postgres';
import {
    buildCutoverPlan,
    type CutoverOptions,
    type CutoverPlan,
    RANKWRANGLER_SERVICE,
} from './central-auth-cutover-lib';

interface LegacyLicense {
    id: string;
    lastResetAt: Date;
    lastUsedAt: Date | null;
    revokedAt: Date | null;
    usageCount: number;
    usageLimit: number;
    usageToday: number;
}

interface AccessProjection {
    access: 'granted' | 'not_granted' | null;
    accessValidUntil: number | null;
    merchbaseUserId: string | null;
    state: 'active' | 'tombstone';
}

interface ServiceAccount {
    id: string;
    lastResetAt: Date;
    lastUsedAt: Date | null;
    merchbaseUserId: string | null;
    usageCount: number;
    usageLimit: number;
    usageToday: number;
}

interface CutoverGate {
    legacyLicenseId: string;
    planDigest: string | null;
    serviceAccountId: string;
    state: 'pending' | 'approved' | 'consumed';
}

export const loadRankWranglerCutoverPlan = async (
    sql: postgres.Sql,
    options: CutoverOptions,
    issuer: string
) => {
    const licenses = await sql<LegacyLicense[]>`
        select
            id,
            "usageCount" as "usageCount",
            "usageToday" as "usageToday",
            "usageLimit" as "usageLimit",
            "lastUsedAt" as "lastUsedAt",
            "lastResetAt" as "lastResetAt",
            "revokedAt" as "revokedAt"
        from licenses
        where id = ${options.legacyLicenseId}
        for update
    `;
    if (licenses.length !== 1 || !licenses[0]) {
        throw new Error('The exact legacy license row was not found.');
    }
    const license = licenses[0];
    if (license.revokedAt) {
        throw new Error('The selected legacy license is revoked.');
    }

    const projections = await sql<AccessProjection[]>`
        select
            state,
            merchbase_user_id as "merchbaseUserId",
            access,
            access_valid_until as "accessValidUntil"
        from access_projection
        where issuer = ${issuer} and subject = ${options.clerkSubject}
        limit 2
    `;
    const projection = projections[0];
    if (
        projections.length !== 1 ||
        !projection ||
        projection.state !== 'active' ||
        projection.merchbaseUserId !== options.merchbaseUserId ||
        projection.access !== 'granted' ||
        (projection.accessValidUntil !== null && projection.accessValidUntil <= Date.now())
    ) {
        throw new Error('The exact active Clerk projection does not grant the requested user.');
    }

    const serviceAccounts = await sql<ServiceAccount[]>`
        select
            id,
            merchbase_user_id as "merchbaseUserId",
            usage_today as "usageToday",
            usage_count as "usageCount",
            usage_limit as "usageLimit",
            last_used_at as "lastUsedAt",
            last_reset_at as "lastResetAt"
        from rankwrangler_service_accounts
        where service = ${RANKWRANGLER_SERVICE} and id = ${options.serviceAccountId}
        limit 2
    `;
    const account = serviceAccounts[0];
    if (
        account &&
        !isSeedableAccount(account, options.merchbaseUserId) &&
        (account.merchbaseUserId !== options.merchbaseUserId ||
            account.usageCount !== license.usageCount ||
            account.usageToday !== license.usageToday ||
            account.usageLimit !== license.usageLimit)
    ) {
        throw new Error('Existing service-account metering does not match the legacy row.');
    }

    const mappedAccounts = await sql<Array<{ id: string }>>`
        select id
        from rankwrangler_service_accounts
        where
            service = ${RANKWRANGLER_SERVICE}
            and merchbase_user_id = ${options.merchbaseUserId}
            and id <> ${options.serviceAccountId}
        limit 1
    `;
    if (mappedAccounts.length > 0) {
        throw new Error('The Merchbase User is already mapped to another service account.');
    }

    const gates = await sql<CutoverGate[]>`
        select
            legacy_license_id as "legacyLicenseId",
            plan_digest as "planDigest",
            service_account_id as "serviceAccountId",
            state
        from rankwrangler_cutover_gate
        where id = ${options.serviceAccountId}
        limit 1
    `;
    const gate = gates[0];
    if (gate && gate.state !== 'pending') {
        throw new Error('The cutover gate is already approved or consumed.');
    }
    if (
        gate &&
        (gate.legacyLicenseId !== license.id || gate.serviceAccountId !== options.serviceAccountId)
    ) {
        throw new Error('The pending cutover gate belongs to a different explicit mapping.');
    }

    const plan = buildCutoverPlan({
        clerkSubject: options.clerkSubject,
        issuer,
        legacyLicenseId: license.id,
        merchbaseUserId: options.merchbaseUserId,
        serviceAccountId: options.serviceAccountId,
        usageCount: license.usageCount,
        usageLimit: license.usageLimit,
        usageToday: license.usageToday,
    });
    if (gate?.planDigest && gate.planDigest !== plan.planDigest) {
        throw new Error('The pending cutover gate belongs to a different plan.');
    }

    return { account, license, plan };
};

export const applyRankWranglerCutoverPlan = async (
    sql: postgres.Sql,
    options: CutoverOptions,
    plan: CutoverPlan,
    issuer: string
) => {
    if (options.confirm !== plan.planDigest) {
        throw new Error('Confirmation must exactly match the displayed plan digest.');
    }
    if (!(options.backupFingerprint && options.preservationProof && options.approvedBy)) {
        throw new Error(
            'Confirmation requires --backup-fingerprint, --preservation-proof, and --approved-by.'
        );
    }
    const backupFingerprint = options.backupFingerprint;
    const preservationProof = options.preservationProof;
    const approvedBy = options.approvedBy;

    await sql.begin(async transaction => {
        const transactionSql = transaction as unknown as postgres.Sql;
        const verified = await loadRankWranglerCutoverPlan(transactionSql, options, issuer);
        if (verified.plan.planDigest !== plan.planDigest) {
            throw new Error('The cutover plan changed while awaiting confirmation.');
        }

        if (verified.account) {
            await transactionSql`
                update rankwrangler_service_accounts
                set
                    merchbase_user_id = ${options.merchbaseUserId},
                    usage_today = ${verified.license.usageToday},
                    usage_count = ${verified.license.usageCount},
                    usage_limit = ${verified.license.usageLimit},
                    last_used_at = ${verified.license.lastUsedAt},
                    last_reset_at = ${verified.license.lastResetAt},
                    updated_at = now()
                where id = ${options.serviceAccountId} and service = ${RANKWRANGLER_SERVICE}
            `;
        } else {
            await transactionSql`
                insert into rankwrangler_service_accounts (
                    id,
                    service,
                    merchbase_user_id,
                    usage_today,
                    usage_count,
                    usage_limit,
                    last_used_at,
                    last_reset_at
                ) values (
                    ${options.serviceAccountId},
                    ${RANKWRANGLER_SERVICE},
                    ${options.merchbaseUserId},
                    ${verified.license.usageToday},
                    ${verified.license.usageCount},
                    ${verified.license.usageLimit},
                    ${verified.license.lastUsedAt},
                    ${verified.license.lastResetAt}
                )
            `;
        }

        await transactionSql`
            insert into rankwrangler_cutover_gate (
                id,
                legacy_license_id,
                service_account_id,
                state,
                plan_digest,
                backup_fingerprint,
                preservation_proof,
                approved_by,
                approved_at,
                updated_at
            ) values (
                ${options.serviceAccountId},
                ${verified.license.id},
                ${options.serviceAccountId},
                'approved',
                ${plan.planDigest},
                ${backupFingerprint},
                ${preservationProof},
                ${approvedBy},
                now(),
                now()
            )
            on conflict (id) do update set
                legacy_license_id = excluded.legacy_license_id,
                service_account_id = excluded.service_account_id,
                state = excluded.state,
                plan_digest = excluded.plan_digest,
                backup_fingerprint = excluded.backup_fingerprint,
                preservation_proof = excluded.preservation_proof,
                approved_by = excluded.approved_by,
                approved_at = excluded.approved_at,
                updated_at = excluded.updated_at
        `;
    });
};
const isSeedableAccount = (account: ServiceAccount, merchbaseUserId: string) =>
    (account.merchbaseUserId === null || account.merchbaseUserId === merchbaseUserId) &&
    account.usageCount === 0 &&
    account.usageToday === 0 &&
    account.lastUsedAt === null;
