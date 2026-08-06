#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const cliPackageDir = path.join(repoRoot, 'packages/cli');
const localDistPath = path.join(cliPackageDir, 'dist', 'index.js');
const rootChangelogPath = path.join(repoRoot, 'CHANGELOG.md');
const LATEST_CHANGELOG_HEADING_PATTERN = /^## v\d+\.\d+\.\d+ - \d{4}-\d{2}-\d{2}$/m;

const main = async () => {
    const tarballName = await packCli();
    const tarballPath = path.join(cliPackageDir, tarballName);
    const extractionDir = await mkdtemp(path.join(tmpdir(), 'rankwrangler-cli-pack-'));
    const latestChangelogHeading = extractLatestChangelogHeading(
        await readFile(rootChangelogPath, 'utf8')
    );

    try {
        await execFileAsync('tar', ['-xzf', tarballPath, '-C', extractionDir]);
        const packedDistDir = path.join(extractionDir, 'package', 'dist');
        const packedChangelogPath = path.join(extractionDir, 'package', 'dist', 'CHANGELOG.md');
        const packedDist = await readPackedDistContents(packedDistDir);
        const packedChangelog = await readFile(packedChangelogPath, 'utf8');
        const { stdout } = await execFileAsync('node', [localDistPath, '--help'], {
            cwd: cliPackageDir,
        });
        const { stdout: changelogStdout } = await execFileAsync(
            'node',
            [localDistPath, 'changelog'],
            {
                cwd: cliPackageDir,
            }
        );

        assertContains(packedDist, 'product:history');
        assertContains(packedDist, "metrics: { type: 'string' }");
        assertContains(packedChangelog, latestChangelogHeading);
        assertContains(stdout, 'product history <ASIN>');
        assertContains(stdout, 'product search <keyword>');
        assertContains(stdout, 'keyword history <keyword>');
        assertContains(stdout, 'changelog');
        assertContains(stdout, 'config set storage-dir <path>');
        assertContains(changelogStdout, latestChangelogHeading);

        console.log('release:check-cli-pack passed');
        console.log(`checked tarball: ${tarballName}`);
    } finally {
        await rm(extractionDir, { recursive: true, force: true });
        await unlink(tarballPath).catch(() => undefined);
    }
};

await main();

async function packCli() {
    const { stdout } = await execFileAsync('npm', ['pack', '--silent'], {
        cwd: cliPackageDir,
    });
    const tarballName = stdout.trim();

    if (!tarballName.endsWith('.tgz')) {
        fail(`unexpected npm pack output: ${tarballName}`);
    }

    return tarballName;
}

async function readPackedDistContents(distDir) {
    const entries = await readdir(distDir, { withFileTypes: true });
    const chunks = await Promise.all(
        entries
            .filter(entry => entry.isFile() && entry.name.endsWith('.js'))
            .map(entry => readFile(path.join(distDir, entry.name), 'utf8'))
    );

    return chunks.join('\n');
}

function assertContains(content, expected) {
    if (!content.includes(expected)) {
        fail(`packed CLI artifact missing expected text: ${expected}`);
    }
}

function extractLatestChangelogHeading(changelog) {
    const heading = changelog.match(LATEST_CHANGELOG_HEADING_PATTERN)?.[0];
    if (!heading) {
        fail('could not resolve latest CHANGELOG.md heading');
    }

    return heading;
}

function fail(message) {
    console.error(`release:check-cli-pack error: ${message}`);
    process.exit(1);
}
