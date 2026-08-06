import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, realpathSync, rmSync } from 'node:fs';
import path from 'node:path';
import { createTempDir, readJson, runCli } from './test-helpers';

const TEMP_DIRS: string[] = [];

afterEach(() => {
    while (TEMP_DIRS.length > 0) {
        const tempDir = TEMP_DIRS.pop();
        if (tempDir) {
            rmSync(tempDir, { force: true, recursive: true });
        }
    }
});

describe('cli config behavior', () => {
    test('persists the active storage dir globally and migrates existing config', () => {
        const tempRoot = createTempDir('rankwrangler-cli-', TEMP_DIRS);
        const tempHome = path.join(tempRoot, 'home');
        const workspaceDir = path.join(tempRoot, 'workspace');
        mkdirSync(tempHome, { recursive: true });
        mkdirSync(workspaceDir, { recursive: true });
        const storageDir = path.join(realpathSync(workspaceDir), 'custom-storage');

        runCli(['config', 'set', 'marketplace', 'TEST_MARKET'], {
            cwd: workspaceDir,
            home: tempHome,
        });
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
        expect(readJson(globalConfigPath)).toEqual({ storageDir });
        expect(readJson(storageConfigPath)).toEqual({ marketplaceId: 'TEST_MARKET' });

        const showResult = runCli(['config', 'show'], { cwd: workspaceDir, home: tempHome });
        expect(showResult.data.storageDir).toBe(storageDir);
        expect(showResult.data.path).toBe(storageConfigPath);
        expect(showResult.data.config).toEqual({ marketplaceId: 'TEST_MARKET' });
        expect(showResult.data.auth).toMatchObject({ source: 'none', envOverride: false });

        const getResult = runCli(['config', 'get', 'marketplace'], {
            cwd: workspaceDir,
            home: tempHome,
        });
        expect(getResult.data).toEqual({ key: 'marketplace', value: 'TEST_MARKET' });

        const baseUrlResult = runCli(['config', 'set', 'base-url', 'https://example.com/api'], {
            cwd: workspaceDir,
            home: tempHome,
        });
        expect(baseUrlResult.data.path).toBe(storageConfigPath);
        expect(readJson(storageConfigPath)).toEqual({
            marketplaceId: 'TEST_MARKET',
            baseUrl: 'https://example.com',
        });
        expect(readJson(defaultConfigPath)).toEqual({ marketplaceId: 'TEST_MARKET' });

        const unsetResult = runCli(['config', 'unset', 'marketplace'], {
            cwd: workspaceDir,
            home: tempHome,
        });
        expect(unsetResult.data.unset).toBe('marketplace');
        expect(readJson(storageConfigPath)).toEqual({ baseUrl: 'https://example.com' });
    });
});
