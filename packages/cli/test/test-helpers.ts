import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI_PATH = fileURLToPath(new URL('../dist/index.js', import.meta.url));
const CLI_PACKAGE_JSON_PATH = fileURLToPath(new URL('../package.json', import.meta.url));
const ROOT_CHANGELOG_PATH = fileURLToPath(new URL('../../../CHANGELOG.md', import.meta.url));
const INTERNAL_SECRET_STORE_DIR_ENV_VAR = 'RW_INTERNAL_CLI_SECRET_STORE_DIR';

export const readJson = (filePath: string) => {
    return JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, string>;
};

export const CURRENT_CLI_VERSION = readJson(CLI_PACKAGE_JSON_PATH).version;
export const LATEST_CHANGELOG_HEADING = getLatestChangelogHeading(
    readFileSync(ROOT_CHANGELOG_PATH, 'utf8')
);

export const createTempDir = (prefix: string, tempDirs: string[]) => {
    const tempDir = mkdtempSync(path.join(tmpdir(), prefix));
    tempDirs.push(tempDir);
    return tempDir;
};

export const runCli = <T = Record<string, unknown>>(
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
        data: T;
    };
};

export const runCliFailure = (
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

export const spawnCli = (
    args: string[],
    { cwd, home, env = {} }: { cwd: string; home: string; env?: Record<string, string> }
) => {
    return spawnSync('node', [CLI_PATH, ...args], {
        cwd,
        env: {
            ...process.env,
            HOME: home,
            [INTERNAL_SECRET_STORE_DIR_ENV_VAR]: path.join(home, '.rankwrangler-secure-store'),
            ...env,
        },
        encoding: 'utf8',
    });
};

function getLatestChangelogHeading(changelog: string) {
    const heading = changelog.match(/^## v\d+\.\d+\.\d+ - \d{4}-\d{2}-\d{2}$/m)?.[0];
    if (!heading) {
        throw new Error('could not resolve latest changelog heading');
    }

    return heading;
}
