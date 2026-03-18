import { existsSync, mkdirSync, realpathSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'bun:test';
import {
    CURRENT_CLI_VERSION,
    LATEST_CHANGELOG_HEADING,
    createTempDir,
    readJson,
    runCli,
    runCliFailure,
    spawnCli,
} from './test-helpers';

const TEMP_DIRS: string[] = [];

afterEach(() => {
    while (TEMP_DIRS.length > 0) {
        const tempDir = TEMP_DIRS.pop();
        if (tempDir) {
            rmSync(tempDir, { force: true, recursive: true });
        }
    }
});

describe('cli behavior', () => {
    test('prints the packaged CLI version', () => {
        const tempRoot = createTempDir('rankwrangler-cli-', TEMP_DIRS);
        const tempHome = path.join(tempRoot, 'home');
        const workspaceDir = path.join(tempRoot, 'workspace');
        mkdirSync(tempHome, { recursive: true });
        mkdirSync(workspaceDir, { recursive: true });

        const result = spawnCli(['--version'], {
            cwd: workspaceDir,
            home: tempHome,
        });

        expect(result.status).toBe(0);
        expect(result.stdout.trim()).toBe(CURRENT_CLI_VERSION);
        expect(result.stderr).toBe('');
    });

    test('prints the latest bundled changelog entry', () => {
        const tempRoot = createTempDir('rankwrangler-cli-', TEMP_DIRS);
        const tempHome = path.join(tempRoot, 'home');
        const workspaceDir = path.join(tempRoot, 'workspace');
        mkdirSync(tempHome, { recursive: true });
        mkdirSync(workspaceDir, { recursive: true });

        const result = spawnCli(['changelog'], {
            cwd: workspaceDir,
            home: tempHome,
        });

        expect(result.status).toBe(0);
        expect(result.stdout).toContain(LATEST_CHANGELOG_HEADING);
        expect(result.stdout).toContain('### Added');
        expect(result.stderr).toBe('');
    });

    test('persists the active storage dir globally and migrates existing config', () => {
        const tempRoot = createTempDir('rankwrangler-cli-', TEMP_DIRS);
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

    test('stores auth in the secure store and keeps secrets out of config', () => {
        const tempRoot = createTempDir('rankwrangler-cli-', TEMP_DIRS);
        const tempHome = path.join(tempRoot, 'home');
        const workspaceDir = path.join(tempRoot, 'workspace');
        mkdirSync(tempHome, { recursive: true });
        mkdirSync(workspaceDir, { recursive: true });

        const setResult = runCli(['auth', 'set', 'rrk_test_value'], {
            cwd: workspaceDir,
            home: tempHome,
        });
        expect(setResult.data.saved).toBe(true);
        expect(setResult.data.source).toBe('secure-store');
        expect(setResult.data.secureStore.available).toBe(true);
        expect(setResult.data.secureStore.hasStoredLicenseKey).toBe(true);

        const authStatus = runCli(['auth', 'status'], {
            cwd: workspaceDir,
            home: tempHome,
        });
        expect(authStatus.data.source).toBe('secure-store');
        expect(authStatus.data.envOverride).toBe(false);

        const configPath = path.join(tempHome, '.rankwrangler', 'config.json');
        const secretStorePath = path.join(tempHome, '.rankwrangler-secure-store', 'license-key.json');

        expect(existsSync(configPath)).toBe(false);
        expect(readJson(secretStorePath)).toEqual({
            licenseKey: 'rrk_test_value',
        });

        const clearResult = runCli(['auth', 'clear'], {
            cwd: workspaceDir,
            home: tempHome,
        });
        expect(clearResult.data.cleared).toBe(true);
        expect(clearResult.data.source).toBe('none');
        expect(clearResult.data.secureStore.hasStoredLicenseKey).toBe(false);
        expect(existsSync(secretStorePath)).toBe(false);
    });

    test('lets RR_LICENSE_KEY override the stored auth', () => {
        const tempRoot = createTempDir('rankwrangler-cli-', TEMP_DIRS);
        const tempHome = path.join(tempRoot, 'home');
        const workspaceDir = path.join(tempRoot, 'workspace');
        mkdirSync(tempHome, { recursive: true });
        mkdirSync(workspaceDir, { recursive: true });

        runCli(['auth', 'set', 'rrk_stored_value'], {
            cwd: workspaceDir,
            home: tempHome,
        });

        const statusResult = runCli(['auth', 'status'], {
            cwd: workspaceDir,
            home: tempHome,
            env: {
                RR_LICENSE_KEY: 'rrk_env_value',
            },
        });
        expect(statusResult.data.source).toBe('env');
        expect(statusResult.data.envOverride).toBe(true);
        expect(statusResult.data.secureStore.hasStoredLicenseKey).toBe(true);
    });

    test('rejects config api-key input and requires auth when no override or stored key exists', () => {
        const tempRoot = createTempDir('rankwrangler-cli-', TEMP_DIRS);
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
        expect(missingKeyFailure.error.message).toBe(
            'license key is required. run `rw auth set <licenseKey>` or set RR_LICENSE_KEY'
        );
    });

    test('lets RR_STORAGE_DIR override the saved storage dir', () => {
        const tempRoot = createTempDir('rankwrangler-cli-', TEMP_DIRS);
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
