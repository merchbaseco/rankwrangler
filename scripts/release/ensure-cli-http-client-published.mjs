#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const cliPackagePath = path.join(repoRoot, 'packages', 'cli', 'package.json');

export const resolveExpectedHttpClientVersion = cliPackageJson => {
    const cliVersion = cliPackageJson.version;
    assert(isSemver(cliVersion), `packages/cli has invalid version: ${cliVersion}`);

    const dependencyVersion = cliPackageJson.dependencies?.['@rankwrangler/http-client'];
    assert(
        dependencyVersion,
        'packages/cli is missing dependency @rankwrangler/http-client',
    );

    const match = dependencyVersion.match(/^\^(\d+\.\d+\.\d+)$/);
    assert(
        match,
        'packages/cli must pin @rankwrangler/http-client with ^X.Y.Z before publish',
    );
    assert(
        match[1] === cliVersion,
        `packages/cli must depend on @rankwrangler/http-client:^${cliVersion} before publish`,
    );

    return match[1];
};

export const assertHttpClientVersionPublished = async (
    version,
    npmViewVersion = defaultNpmViewVersion,
) => {
    assert(isSemver(version), `invalid @rankwrangler/http-client version: ${version}`);

    let publishedVersion;
    try {
        publishedVersion = await npmViewVersion(version);
    } catch (error) {
        throw new Error(buildPublishOrderMessage(version), { cause: error });
    }

    assert(
        publishedVersion === version,
        `npm reported @rankwrangler/http-client@${publishedVersion} while ${version} is required`,
    );
};

export const main = async () => {
    const cliPackageJson = await readJson(cliPackagePath);
    const version = resolveExpectedHttpClientVersion(cliPackageJson);

    await assertHttpClientVersionPublished(version);

    console.log(
        `cli publish check passed: @rankwrangler/http-client@${version} is available on npm`,
    );
};

const defaultNpmViewVersion = async version => {
    const spec = `@rankwrangler/http-client@${version}`;
    const { stdout } = await execFileAsync('npm', ['view', spec, 'version', '--json'], {
        cwd: path.dirname(cliPackagePath),
    });
    const parsed = JSON.parse(stdout.trim());

    assert(typeof parsed === 'string', `unexpected npm view output for ${spec}`);

    return parsed;
};

const buildPublishOrderMessage = version => {
    return [
        `cannot publish @rankwrangler/cli until @rankwrangler/http-client@${version} is on npm`,
        'publish packages/http-client first, then retry packages/cli',
    ].join('; ');
};

const readJson = async absolutePath => {
    const content = await readFile(absolutePath, 'utf8');
    return JSON.parse(content);
};

const isSemver = value => /^\d+\.\d+\.\d+$/.test(value);

const assert = (condition, message) => {
    if (!condition) {
        throw new Error(message);
    }
};

const reportFailure = error => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`release:cli-publish error: ${message}`);
    if (error instanceof Error && error.cause instanceof Error && error.cause.message) {
        console.error(error.cause.message);
    }

    process.exit(1);
};

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
    await main().catch(reportFailure);
}
