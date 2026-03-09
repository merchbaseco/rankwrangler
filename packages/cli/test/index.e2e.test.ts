import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, test } from 'bun:test';

const CLI_PATH = fileURLToPath(new URL('../dist/index.js', import.meta.url));
const TEMP_DIRS: string[] = [];

afterEach(() => {
    while (TEMP_DIRS.length > 0) {
        const tempDir = TEMP_DIRS.pop();
        if (tempDir) {
            rmSync(tempDir, { force: true, recursive: true });
        }
    }
});

describe('cli storage-dir persistence', () => {
    test('persists the active storage dir globally and migrates existing config', () => {
        const tempRoot = createTempDir('rankwrangler-cli-');
        const tempHome = path.join(tempRoot, 'home');
        const workspaceDir = path.join(tempRoot, 'workspace');
        mkdirSync(tempHome, { recursive: true });
        mkdirSync(workspaceDir, { recursive: true });
        const storageDir = path.join(realpathSync(workspaceDir), 'custom-storage');

        runCli(['config', 'set', 'marketplace', 'TEST_MARKET'], { cwd: workspaceDir, home: tempHome });
        const switchResult = runCli(['config', 'set', 'storage-dir', './custom-storage'], {
            cwd: workspaceDir,
            home: tempHome,
        });

        expect(switchResult.data.storageDir).toBe(storageDir);
        expect(switchResult.data.path).toBe(path.join(storageDir, 'config.json'));
        expect(switchResult.data.config.marketplaceId).toBe('TEST_MARKET');

        const globalConfigPath = path.join(tempHome, '.rankwrangler', 'global.json');
        const defaultConfigPath = path.join(tempHome, '.rankwrangler', 'config.json');
        const storageConfigPath = path.join(storageDir, 'config.json');

        expect(existsSync(globalConfigPath)).toBe(true);
        expect(existsSync(defaultConfigPath)).toBe(true);
        expect(existsSync(storageConfigPath)).toBe(true);

        expect(readJson(globalConfigPath)).toEqual({
            storageDir,
        });
        expect(readJson(storageConfigPath)).toEqual({
            marketplaceId: 'TEST_MARKET',
        });

        const showResult = runCli(['config', 'show'], { cwd: workspaceDir, home: tempHome });
        expect(showResult.data.storageDir).toBe(storageDir);
        expect(showResult.data.path).toBe(storageConfigPath);
        expect(showResult.data.config).toEqual({
            marketplaceId: 'TEST_MARKET',
        });

        const baseUrlResult = runCli(['config', 'set', 'base-url', 'https://example.com/api'], {
            cwd: workspaceDir,
            home: tempHome,
        });
        expect(baseUrlResult.data.path).toBe(storageConfigPath);
        expect(readJson(storageConfigPath)).toEqual({
            marketplaceId: 'TEST_MARKET',
            baseUrl: 'https://example.com',
        });
        expect(readJson(defaultConfigPath)).toEqual({
            marketplaceId: 'TEST_MARKET',
        });
    });

    test('requires env api keys and rejects removed config api-key input', () => {
        const tempRoot = createTempDir('rankwrangler-cli-');
        const tempHome = path.join(tempRoot, 'home');
        const workspaceDir = path.join(tempRoot, 'workspace');
        mkdirSync(tempHome, { recursive: true });
        mkdirSync(workspaceDir, { recursive: true });

        const configFailure = runCliFailure(['config', 'set', 'api-key', 'rrk_test_value'], {
            cwd: workspaceDir,
            home: tempHome,
        });
        expect(configFailure.error.code).toBe('INVALID_INPUT');
        expect(configFailure.error.details).toEqual({
            key: 'api-key',
            supportedKeys: ['base-url', 'marketplace', 'storage-dir'],
        });

        const missingKeyFailure = runCliFailure(['products', 'get', 'B0DV53VS61'], {
            cwd: workspaceDir,
            home: tempHome,
        });
        expect(missingKeyFailure.error.code).toBe('MISSING_CONFIG');
        expect(missingKeyFailure.error.message).toBe('api key is required. set RR_LICENSE_KEY');
    });

    test('lets RR_STORAGE_DIR override the saved storage dir', () => {
        const tempRoot = createTempDir('rankwrangler-cli-');
        const tempHome = path.join(tempRoot, 'home');
        const workspaceDir = path.join(tempRoot, 'workspace');
        mkdirSync(tempHome, { recursive: true });
        mkdirSync(workspaceDir, { recursive: true });

        const savedStorageDir = path.join(realpathSync(workspaceDir), 'saved-storage');
        const envStorageDir = path.join(realpathSync(workspaceDir), 'env-storage');

        runCli(['config', 'set', 'storage-dir', './saved-storage'], {
            cwd: workspaceDir,
            home: tempHome,
        });

        const envShowResult = runCli(['config', 'set', 'marketplace', 'ENV_MARKET'], {
            cwd: workspaceDir,
            home: tempHome,
            env: {
                RR_STORAGE_DIR: envStorageDir,
            },
        });
        expect(envShowResult.data.storageDir).toBe(envStorageDir);
        expect(envShowResult.data.path).toBe(path.join(envStorageDir, 'config.json'));

        const envConfigPath = path.join(envStorageDir, 'config.json');
        const globalConfigPath = path.join(tempHome, '.rankwrangler', 'global.json');

        expect(readJson(envConfigPath)).toEqual({
            marketplaceId: 'ENV_MARKET',
        });
        expect(readJson(globalConfigPath)).toEqual({
            storageDir: savedStorageDir,
        });

        const defaultShowResult = runCli(['config', 'show'], {
            cwd: workspaceDir,
            home: tempHome,
        });
        expect(defaultShowResult.data.storageDir).toBe(savedStorageDir);
        expect(defaultShowResult.data.path).toBe(path.join(savedStorageDir, 'config.json'));

        const envOverrideShowResult = runCli(['config', 'show'], {
            cwd: workspaceDir,
            home: tempHome,
            env: {
                RR_STORAGE_DIR: envStorageDir,
            },
        });
        expect(envOverrideShowResult.data.storageDir).toBe(envStorageDir);
        expect(envOverrideShowResult.data.config).toEqual({
            marketplaceId: 'ENV_MARKET',
        });
    });
});

const runCli = (
    args: string[],
    options: { cwd: string; home: string; env?: Record<string, string> }
) => {
    const result = spawnCli(args, options);
    if (result.status !== 0) {
        throw new Error(
            `CLI command failed (${args.join(' ')}): ${result.stderr || result.stdout || 'unknown error'}`
        );
    }

    return JSON.parse(result.stdout) as {
        ok: true;
        data: {
            storageDir: string;
            path: string;
            config: Record<string, string>;
        };
    };
};

const runCliFailure = (
    args: string[],
    options: { cwd: string; home: string; env?: Record<string, string> }
) => {
    const result = spawnCli(args, options);
    if (result.status === 0) {
        throw new Error(`CLI command unexpectedly succeeded (${args.join(' ')})`);
    }

    return JSON.parse(result.stderr) as {
        ok: false;
        error: {
            code: string;
            message: string;
            details?: unknown;
        };
    };
};

const spawnCli = (
    args: string[],
    { cwd, home, env = {} }: { cwd: string; home: string; env?: Record<string, string> }
) => {
    const result = spawnSync('node', [CLI_PATH, ...args], {
        cwd,
        env: {
            ...process.env,
            HOME: home,
            ...env,
        },
        encoding: 'utf8',
    });

    return result;
};

const createTempDir = (prefix: string) => {
    const tempDir = mkdtempSync(path.join(tmpdir(), prefix));
    TEMP_DIRS.push(tempDir);
    return tempDir;
};

const readJson = (filePath: string) => {
    return JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, string>;
};
