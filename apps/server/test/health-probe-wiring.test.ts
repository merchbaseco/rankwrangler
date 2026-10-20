import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

const read = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');

const compose = read('../compose.yml');
const dockerfile = read('../Dockerfile');
const caddyfile = read('../Caddyfile');
const deploy = read('../../../.github/workflows/deploy.yml');

describe('health probe wiring', () => {
    it('points container, image, and Caddy probes at /health/live', () => {
        for (const [source, needle] of [
            [compose, 'http://127.0.0.1:8080/'],
            [compose, 'http://localhost/'],
            [dockerfile, 'http://127.0.0.1:8080/'],
            [caddyfile, 'health_uri'],
        ] as const) {
            const line = source.split('\n').find(candidate => candidate.includes(needle));
            expect(line).toBeDefined();
            expect(line).toContain('/health/live');
            expect(line).not.toContain('/api/health');
        }

        const liveHandle = caddyfile.indexOf('handle /health/live');
        const spaHandle = caddyfile.indexOf('    handle * {');
        expect(liveHandle).toBeGreaterThan(-1);
        expect(spaHandle).toBeGreaterThan(liveHandle);
    });

    it('deploys the Quality commit and polls both health URLs', () => {
        expect(deploy).toContain('workflows: [Quality]');
        expect(deploy).toContain('types: [completed]');
        expect(deploy).toContain('branches: [main]');
        expect(deploy).toContain('group: rankwrangler-production');
        expect(deploy).toContain('cancel-in-progress: false');
        expect(deploy).not.toContain('reset --hard');
        expect(deploy).toContain('https://rankwrangler.merchbase.co/health/live');
        expect(deploy).toContain('https://rankwrangler.merchbase.co/api/health');
    });
});
