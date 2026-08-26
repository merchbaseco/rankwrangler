import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'bun:test';
import { assertLocalSeedTarget, SeedTargetRefusedError } from '@/dev-seed/local-database-guard';

/**
 * The guard is the only thing standing between a destructive clear-and-refill
 * and a database that matters, so it is tested as a refusal list rather than a
 * happy path. Every case here is a way the seed could have been pointed
 * somewhere it must never run.
 */

const localTarget = {
    database: 'rankwrangler',
    host: '127.0.0.1',
    port: 5433,
};

/**
 * The production host as the environment contract actually declares it, read
 * from `.env.schema` rather than copied here, so the test keeps tracking the
 * real value if it changes. Only the host is read — never a credential — and
 * `RANKWRANGLER_DATABASE_HOST` is a `@public` schema item.
 */
const readProductionDatabaseHost = () => {
    const schemaPath = fileURLToPath(new URL('../../../../.env.schema', import.meta.url));
    const declaration = readFileSync(schemaPath, 'utf8')
        .split('\n')
        .find(line => line.startsWith('RANKWRANGLER_DATABASE_HOST='));
    const productionHost = declaration?.match(
        /eq\(\$VARLOCK_ENV,\s*production\),\s*([^,)]+)/u
    )?.[1];

    if (!productionHost) {
        throw new Error('Could not read the production database host from .env.schema.');
    }

    return productionHost.trim();
};

describe('dev seed local database guard', () => {
    it('accepts loopback hosts', () => {
        for (const host of ['127.0.0.1', 'localhost', '::1', '[::1]', 'LOCALHOST']) {
            expect(assertLocalSeedTarget({ ...localTarget, host }).host).not.toBe('');
        }
    });

    it('refuses the production database host declared in the environment contract', () => {
        const host = readProductionDatabaseHost();

        expect(host).not.toBe('127.0.0.1');
        expect(() => assertLocalSeedTarget({ ...localTarget, host })).toThrow(
            SeedTargetRefusedError
        );
    });

    it('refuses every non-loopback host, however it is spelled', () => {
        const refused = [
            'postgres',
            'db.internal',
            'rankwrangler.example.com',
            '10.0.0.4',
            '192.168.1.20',
            '0.0.0.0',
            '127.0.0.1.evil.example.com',
            'localhost.evil.example.com',
        ];

        for (const host of refused) {
            expect(() => assertLocalSeedTarget({ ...localTarget, host })).toThrow(
                SeedTargetRefusedError
            );
        }
    });

    it('refuses a production NODE_ENV even when the host is loopback', () => {
        expect(() => assertLocalSeedTarget({ ...localTarget, nodeEnv: 'production' })).toThrow(
            SeedTargetRefusedError
        );
    });

    it('refuses an unset host rather than falling back to a default', () => {
        expect(() => assertLocalSeedTarget({ ...localTarget, host: undefined })).toThrow(
            SeedTargetRefusedError
        );
        expect(() => assertLocalSeedTarget({ ...localTarget, host: '  ' })).toThrow(
            SeedTargetRefusedError
        );
    });

    it('names the target in the refusal so the operator can see what was rejected', () => {
        expect(() => assertLocalSeedTarget({ ...localTarget, host: 'postgres' })).toThrow(
            /postgres:5433\/rankwrangler/u
        );
    });

    it('offers no override: nothing in the environment unlocks a remote host', () => {
        const escapeHatches = [
            'ALLOW_REMOTE_SEED',
            'CI',
            'DEV_SEED_FORCE',
            'FORCE',
            'RANKWRANGLER_SEED_FORCE',
        ];

        for (const name of escapeHatches) {
            process.env[name] = 'true';
        }

        try {
            expect(() => assertLocalSeedTarget({ ...localTarget, host: 'postgres' })).toThrow(
                SeedTargetRefusedError
            );
        } finally {
            for (const name of escapeHatches) {
                delete process.env[name];
            }
        }
    });
});
