import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { HEALTH_LIVE_PATH } from '@/health/health-routes';

describe('infrastructure health pollers', () => {
    it.each([
        ['../Dockerfile', 1],
        ['../compose.yml', 2],
        ['../Caddyfile', 1],
        ['../../../.github/workflows/deploy.yml', 1],
    ] as const)('%s polls only the liveness path', (path, pollerCount) => {
        expect(healthPaths(read(path))).toEqual(
            Array.from({ length: pollerCount }, () => HEALTH_LIVE_PATH)
        );
    });

    it('keeps Caddy from failing its upstream on a degraded health body', () => {
        const caddyfile = read('../Caddyfile');
        const healthUri = caddyfile.split('\n').find(line => line.trim().startsWith('health_uri '));

        expect(healthUri?.trim()).toBe(`health_uri ${HEALTH_LIVE_PATH}`);
        expect(caddyfile).not.toContain('unhealthy_status');
    });
});

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const healthPaths = (text: string) =>
    Array.from(text.matchAll(/\/api\/health[\w/-]*/g), match => match[0]);
