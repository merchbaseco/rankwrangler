import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'bun:test';
import { createTempDir, spawnCliAsync } from './test-helpers';

const TEMP_DIRS: string[] = [];
const CLI_TEST_SERVER_PORT = Number(
    execFileSync('dev-port', ['--group'], { encoding: 'utf8' }).trim().split(/\s+/)[1]
);

afterEach(() => {
    while (TEMP_DIRS.length > 0) {
        const tempDir = TEMP_DIRS.pop();
        if (tempDir) {
            rmSync(tempDir, { force: true, recursive: true });
        }
    }
});

describe('Catalog CLI', () => {
    test('requests a force-fresh Catalog search and prints the shared pending contract', async () => {
        const server = Bun.serve({
            port: CLI_TEST_SERVER_PORT,
            async fetch(request) {
                expect(request.url).toContain('catalog.search');
                const body = await request.json();
                expect(JSON.stringify(body)).toContain('"term":"retro gardening shirt"');
                expect(JSON.stringify(body)).toContain('"maxAgeSeconds":0');
                return Response.json([
                    {
                        result: {
                            data: {
                                status: 'pending',
                                operation: {
                                    id: '11111111-1111-4111-8111-111111111111',
                                    type: 'catalogSearch',
                                    status: 'pending',
                                    retryAfterSeconds: 2,
                                    createdAt: '2026-07-23T12:00:00.000Z',
                                    updatedAt: '2026-07-23T12:00:00.000Z',
                                },
                            },
                        },
                    },
                ]);
            },
        });
        const { tempHome, workspaceDir } = createCliWorkspace();

        try {
            const result = await spawnCliAsync(
                [
                    'catalog',
                    'search',
                    'retro',
                    'gardening',
                    'shirt',
                    '--maxAgeSeconds',
                    '0',
                    '--baseUrl',
                    `http://127.0.0.1:${server.port}`,
                ],
                {
                    cwd: workspaceDir,
                    home: tempHome,
                    env: { RR_LICENSE_KEY: 'rrk_test_value' },
                }
            );

            expect(result.status).toBe(0);
            expect(JSON.parse(result.stdout)).toMatchObject({
                ok: true,
                data: {
                    status: 'pending',
                    operation: { type: 'catalogSearch' },
                },
            });
        } finally {
            server.stop(true);
        }
    });
});

const createCliWorkspace = () => {
    const tempRoot = createTempDir('rankwrangler-cli-', TEMP_DIRS);
    const tempHome = path.join(tempRoot, 'home');
    const workspaceDir = path.join(tempRoot, 'workspace');
    mkdirSync(tempHome, { recursive: true });
    mkdirSync(workspaceDir, { recursive: true });
    return { tempHome, workspaceDir };
};
