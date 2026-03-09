#!/usr/bin/env node

import { mkdtemp, readFile, readdir, rm, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const cliPackageDir = path.join(repoRoot, 'packages/cli');

const main = async () => {
    const tarballName = await packCli();
    const tarballPath = path.join(cliPackageDir, tarballName);
    const extractionDir = await mkdtemp(path.join(tmpdir(), 'rankwrangler-cli-pack-'));

    try {
        await execFileAsync('tar', ['-xzf', tarballPath, '-C', extractionDir]);
        const packedDistDir = path.join(extractionDir, 'package', 'dist');
        const packedDist = await readPackedDistContents(packedDistDir);

        assertContains(packedDist, 'products:history');
        assertContains(packedDist, "metrics: { type: 'string' }");
        assertContains(packedDist, 'products history <ASIN>');

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

function fail(message) {
    console.error(`release:check-cli-pack error: ${message}`);
    process.exit(1);
}
