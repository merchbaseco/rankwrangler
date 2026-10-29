import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

const read = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');

const compose = read('../compose.yml');
const dockerfile = read('../Dockerfile');
const caddyfile = read('../Caddyfile');

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
});
