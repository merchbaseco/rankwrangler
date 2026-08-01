export interface PreservationManifest {
    collections: Record<string, { count: number; fingerprint: string }>;
    legacyLicense: {
        fingerprint: string;
        lastResetAt: string;
        lastUsedAt: string | null;
        usageCount: number;
        usageLimit: number;
        usageToday: number;
    };
    serviceAccount: {
        fingerprint: string;
    };
    version: 2;
}

export const assertPreservation = (before: PreservationManifest, after: PreservationManifest) => {
    if (
        before.version !== 2 ||
        after.version !== 2 ||
        before.version !== after.version ||
        before.legacyLicense.fingerprint !== after.legacyLicense.fingerprint ||
        before.serviceAccount.fingerprint !== after.serviceAccount.fingerprint
    ) {
        throw new Error('Central-auth preservation manifest identity proof failed.');
    }

    if (
        before.legacyLicense.usageCount !== after.legacyLicense.usageCount ||
        before.legacyLicense.usageToday !== after.legacyLicense.usageToday ||
        before.legacyLicense.usageLimit !== after.legacyLicense.usageLimit ||
        before.legacyLicense.lastResetAt !== after.legacyLicense.lastResetAt ||
        before.legacyLicense.lastUsedAt !== after.legacyLicense.lastUsedAt
    ) {
        throw new Error('Central-auth metering preservation proof failed.');
    }

    for (const [name, expected] of Object.entries(before.collections)) {
        const actual = after.collections[name];
        if (
            !actual ||
            actual.count !== expected.count ||
            actual.fingerprint !== expected.fingerprint
        ) {
            throw new Error(`Customer/product preservation proof failed for ${name}.`);
        }
    }
};
