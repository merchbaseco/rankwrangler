import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'bun:test';
import {
    createTempDir,
    runCliFailure,
    spawnCliAsync,
} from './test-helpers';

const TEMP_DIRS: string[] = [];
const CLI_TEST_SERVER_PORT = Number(
    execFileSync('dev-port', ['--group'], { encoding: 'utf8' }).trim().split(/\s+/)[0]
);

afterEach(() => {
    while (TEMP_DIRS.length > 0) {
        const tempDir = TEMP_DIRS.pop();
        if (tempDir) {
            rmSync(tempDir, { force: true, recursive: true });
        }
    }
});

describe('Operation CLI', () => {
    test('requires one id for polling', () => {
        const { tempHome, workspaceDir } = createCliWorkspace();
        const failure = runCliFailure(
            [
                'operations',
                'get',
                '11111111-1111-4111-8111-111111111111',
                '22222222-2222-4222-8222-222222222222',
            ],
            {
                cwd: workspaceDir,
                home: tempHome,
                env: { RR_LICENSE_KEY: 'rrk_test_value' },
            }
        );

        expect(failure.error.code).toBe('INVALID_INPUT');
        expect(failure.error.message).toBe('operations get requires exactly one id');
    });

    test('polls and prints a completed Operation', async () => {
        const operationId = '11111111-1111-4111-8111-111111111111';
        const server = Bun.serve({
            port: CLI_TEST_SERVER_PORT,
            fetch(request) {
                expect(request.url).toContain('operation.get');
                expect(request.headers.get('authorization')).toBe('Bearer rrk_test_value');
                return Response.json([
                    {
                        result: {
                            data: {
                                id: operationId,
                                type: 'productHistoryRefresh',
                                status: 'completed',
                                resource: {
                                    type: 'productHistory',
                                    marketplaceId: 'ATVPDKIKX0DER',
                                    asin: 'B012345678',
                                },
                                error: null,
                                createdAt: '2026-07-23T12:00:00.000Z',
                                updatedAt: '2026-07-23T12:01:00.000Z',
                                completedAt: '2026-07-23T12:01:00.000Z',
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
                    'operations',
                    'get',
                    operationId,
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
                    id: operationId,
                    status: 'completed',
                    resource: {
                        type: 'productHistory',
                        asin: 'B012345678',
                    },
                },
            });
            expect(result.stderr).toBe('');
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
