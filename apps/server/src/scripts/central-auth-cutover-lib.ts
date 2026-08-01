import { createHash } from 'node:crypto';

export const RANKWRANGLER_SERVICE = 'rankwrangler' as const;
const CLERK_SUBJECT_PATTERN = /^user_[A-Za-z0-9_]+$/;
const MERCHBASE_USER_PATTERN = /^mbu_[A-Za-z0-9_]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FINGERPRINT_PATTERN = /^[0-9a-f]{64}$/;
const LINE_BREAK_PATTERN = /[\r\n]/;

export interface CutoverOptions {
    approvedBy?: string;
    backupFingerprint?: string;
    clerkSubject: string;
    confirm?: string;
    legacyLicenseId: string;
    merchbaseUserId: string;
    preservationProof?: string;
    serviceAccountId: string;
}

export interface CutoverPlan {
    clerkIdentityFingerprint: string;
    legacyLicenseFingerprint: string;
    merchbaseUserFingerprint: string;
    metering: {
        usageCount: number;
        usageLimit: number;
        usageToday: number;
    };
    planDigest: string;
    serviceAccountFingerprint: string;
}

export const parseCutoverOptions = (args: string[]): CutoverOptions => {
    const values = new Map<string, string>();

    for (const arg of args) {
        const separator = arg.indexOf('=');
        if (!arg.startsWith('--') || separator < 0) {
            throw new Error(`Expected --name=value: ${arg}`);
        }
        values.set(arg.slice(2, separator), arg.slice(separator + 1).trim());
    }

    const options: CutoverOptions = {
        approvedBy: values.get('approved-by'),
        backupFingerprint: values.get('backup-fingerprint'),
        clerkSubject: required(values, 'clerk-subject'),
        confirm: values.get('confirm'),
        legacyLicenseId: required(values, 'legacy-license-id').toLowerCase(),
        merchbaseUserId: required(values, 'merchbase-user-id'),
        preservationProof: values.get('preservation-proof'),
        serviceAccountId: required(values, 'service-account-id').toLowerCase(),
    };

    assertPattern(options.clerkSubject, CLERK_SUBJECT_PATTERN, 'clerk-subject');
    assertPattern(options.merchbaseUserId, MERCHBASE_USER_PATTERN, 'merchbase-user-id');
    assertPattern(options.legacyLicenseId, UUID_PATTERN, 'legacy-license-id');
    assertPattern(options.serviceAccountId, UUID_PATTERN, 'service-account-id');

    if (options.backupFingerprint) {
        assertFingerprint(options.backupFingerprint, 'backup-fingerprint');
    }
    if (options.preservationProof) {
        assertFingerprint(options.preservationProof, 'preservation-proof');
    }
    if (
        options.approvedBy &&
        (options.approvedBy.length > 200 || LINE_BREAK_PATTERN.test(options.approvedBy))
    ) {
        throw new Error('approved-by must be a short single-line value.');
    }

    return options;
};

export const buildCutoverPlan = (input: {
    clerkSubject: string;
    issuer: string;
    legacyLicenseId: string;
    merchbaseUserId: string;
    serviceAccountId: string;
    usageCount: number;
    usageLimit: number;
    usageToday: number;
}): CutoverPlan => {
    const planDigest = fingerprint({
        clerkSubject: input.clerkSubject,
        issuer: input.issuer,
        legacyLicenseId: input.legacyLicenseId,
        merchbaseUserId: input.merchbaseUserId,
        service: RANKWRANGLER_SERVICE,
        serviceAccountId: input.serviceAccountId,
        usageCount: input.usageCount,
        usageLimit: input.usageLimit,
        usageToday: input.usageToday,
    });

    return {
        clerkIdentityFingerprint: fingerprint(`${input.issuer}:${input.clerkSubject}`),
        legacyLicenseFingerprint: fingerprint(input.legacyLicenseId),
        merchbaseUserFingerprint: fingerprint(input.merchbaseUserId),
        metering: {
            usageCount: input.usageCount,
            usageLimit: input.usageLimit,
            usageToday: input.usageToday,
        },
        planDigest,
        serviceAccountFingerprint: fingerprint(input.serviceAccountId),
    };
};

export const fingerprint = (value: unknown) =>
    createHash('sha256').update(JSON.stringify(value)).digest('hex');

export const assertFingerprint = (value: string, name: string) => {
    assertPattern(value, FINGERPRINT_PATTERN, name);
};

const required = (values: Map<string, string>, name: string) => {
    const value = values.get(name);
    if (!value) {
        throw new Error(`Missing --${name}=...`);
    }
    return value;
};

const assertPattern = (value: string, pattern: RegExp, name: string) => {
    if (!pattern.test(value)) {
        throw new Error(`Invalid --${name}=...`);
    }
};
