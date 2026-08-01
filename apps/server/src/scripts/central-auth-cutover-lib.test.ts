import { describe, expect, it } from 'bun:test';
import { buildCutoverPlan, parseCutoverOptions } from './central-auth-cutover-lib';

const FINGERPRINT_PATTERN = /^[0-9a-f]{64}$/;

describe('central-auth cutover plan', () => {
    it('requires explicit identity and service-account identifiers', () => {
        const options = parseCutoverOptions([
            '--approved-by=operator-ticket-123',
            '--clerk-subject=user_test_123',
            '--legacy-license-id=11111111-1111-4111-8111-111111111111',
            '--merchbase-user-id=mbu_test_123',
            '--service-account-id=22222222-2222-4222-8222-222222222222',
        ]);

        expect(options.clerkSubject).toBe('user_test_123');
        expect(options.merchbaseUserId).toBe('mbu_test_123');
        expect(() =>
            parseCutoverOptions([
                '--clerk-subject=user_test_123',
                '--legacy-license-id=11111111-1111-4111-8111-111111111111',
                '--merchbase-user-id=customer@example.com',
                '--service-account-id=22222222-2222-4222-8222-222222222222',
            ])
        ).toThrow('Invalid --merchbase-user-id=...');
    });

    it('emits only sanitized fingerprints while preserving metering values', () => {
        const plan = buildCutoverPlan({
            clerkSubject: 'user_test_123',
            issuer: 'https://clerk.test',
            legacyLicenseId: '11111111-1111-4111-8111-111111111111',
            merchbaseUserId: 'mbu_test_123',
            serviceAccountId: '22222222-2222-4222-8222-222222222222',
            usageCount: 17,
            usageLimit: 100,
            usageToday: 5,
        });
        const serialized = JSON.stringify(plan);

        expect(serialized).not.toContain('user_test_123');
        expect(serialized).not.toContain('mbu_test_123');
        expect(serialized).not.toContain('11111111-1111-4111-8111-111111111111');
        expect(serialized).not.toContain('22222222-2222-4222-8222-222222222222');
        expect(plan.metering).toEqual({ usageCount: 17, usageLimit: 100, usageToday: 5 });
        expect(plan.planDigest).toMatch(FINGERPRINT_PATTERN);
        expect(
            buildCutoverPlan({
                clerkSubject: 'user_different_123',
                issuer: 'https://clerk.test',
                legacyLicenseId: '11111111-1111-4111-8111-111111111111',
                merchbaseUserId: 'mbu_test_123',
                serviceAccountId: '22222222-2222-4222-8222-222222222222',
                usageCount: 17,
                usageLimit: 100,
                usageToday: 5,
            }).planDigest
        ).not.toBe(plan.planDigest);
        expect(plan).toEqual(
            buildCutoverPlan({
                clerkSubject: 'user_test_123',
                issuer: 'https://clerk.test',
                legacyLicenseId: '11111111-1111-4111-8111-111111111111',
                merchbaseUserId: 'mbu_test_123',
                serviceAccountId: '22222222-2222-4222-8222-222222222222',
                usageCount: 17,
                usageLimit: 100,
                usageToday: 5,
            })
        );
    });
});
