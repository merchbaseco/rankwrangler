import { describe, expect, it } from 'bun:test';
import {
    assertPreservation,
    type PreservationManifest,
} from './central-auth-preservation-proof-lib';

const createManifest = (legacyFingerprint: string): PreservationManifest => ({
    collections: {
        products: { count: 1, fingerprint: 'products-fingerprint' },
    },
    legacyLicense: {
        fingerprint: legacyFingerprint,
        lastResetAt: '2026-08-01T12:00:00.000Z',
        lastUsedAt: '2026-08-01T12:00:00.000Z',
        usageCount: 17,
        usageLimit: 100,
        usageToday: 5,
    },
    serviceAccount: { fingerprint: 'service-account-one' },
    version: 2,
});

describe('central-auth preservation proof', () => {
    it('binds the after proof to the exact legacy license identity', () => {
        const before = createManifest('legacy-license-one');
        const after = createManifest('legacy-license-two');

        expect(() => assertPreservation(before, after)).toThrow(
            'Central-auth preservation manifest identity proof failed.'
        );
    });

    it('accepts an unchanged versioned manifest', () => {
        const manifest = createManifest('legacy-license-one');

        expect(() => assertPreservation(manifest, manifest)).not.toThrow();
    });

    it('binds the after proof to the exact service account identity', () => {
        const before = createManifest('legacy-license-one');
        const after = {
            ...before,
            serviceAccount: { fingerprint: 'service-account-two' },
        };

        expect(() => assertPreservation(before, after)).toThrow(
            'Central-auth preservation manifest identity proof failed.'
        );
    });
});
