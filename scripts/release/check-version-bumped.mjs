import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { publishedPackages } from './published-packages.mjs';

export const findUnbumpedChanges = async ({
    checkout,
    packages = publishedPackages,
    readVersion = defaultReadVersion,
    publishedVersion = defaultPublishedVersion,
    resolveBase = defaultResolveBase,
    diffNames = defaultDiffNames,
}) => {
    const problems = [];
    for (const pkg of packages) {
        const local = await readVersion(checkout, pkg);
        const published = await publishedVersion(pkg.name);
        if (published === null || local !== published) {
            continue;
        }
        const base = await resolveBase(checkout, pkg, published);
        if (!base) {
            problems.push(
                `${pkg.name}@${local} has no v${local} tag or npm gitHead to diff against.`,
            );
            continue;
        }
        const names = await diffNames(checkout, base, pkg.directory);
        if (names.length > 0) {
            problems.push(
                `${pkg.name}@${local} changed since ${base} without a version bump:\n${names.join('\n')}`,
            );
        }
    }
    return problems;
};

const main = async () => {
    const checkout = process.env.PRODUCTION_CHECKOUT;
    if (!checkout) {
        throw new Error('PRODUCTION_CHECKOUT is required.');
    }
    const problems = await findUnbumpedChanges({ checkout });
    if (problems.length > 0) {
        throw new Error(problems.join('\n\n'));
    }
    console.log('Version bump backstop passed.');
};

const defaultReadVersion = async (checkout, pkg) => {
    const file = path.join(checkout, pkg.directory, 'package.json');
    const json = JSON.parse(await readFile(file, 'utf8'));
    return json.version;
};

const defaultPublishedVersion = async name => {
    const result = spawnSync('npm', ['view', name, 'version'], { encoding: 'utf8' });
    if (result.status === 0) {
        return result.stdout.trim();
    }
    const detail = `${result.stderr ?? ''}\n${result.stdout ?? ''}`;
    if (detail.includes('E404')) {
        return null;
    }
    throw new Error(`npm view ${name} version failed: ${detail}`);
};

const defaultResolveBase = async (checkout, pkg, version) => {
    const tag = `v${version}`;
    const local = spawnSync('git', ['rev-parse', '--verify', '--quiet', `${tag}^{commit}`], {
        cwd: checkout,
        encoding: 'utf8',
    });
    if (local.status === 0 && local.stdout.trim()) {
        return local.stdout.trim();
    }
    const fetched = spawnSync(
        'git',
        ['fetch', 'origin', `refs/tags/${tag}:refs/tags/${tag}`],
        { cwd: checkout, encoding: 'utf8' },
    );
    if (fetched.status === 0) {
        const again = spawnSync('git', ['rev-parse', '--verify', '--quiet', `${tag}^{commit}`], {
            cwd: checkout,
            encoding: 'utf8',
        });
        if (again.status === 0 && again.stdout.trim()) {
            return again.stdout.trim();
        }
    }
    const gitHead = spawnSync('npm', ['view', pkg.name, 'gitHead'], { encoding: 'utf8' });
    if (gitHead.status !== 0) {
        return null;
    }
    const sha = gitHead.stdout.trim();
    if (!/^[0-9a-f]{40}$/.test(sha)) {
        return null;
    }
    const hasCommit = spawnSync('git', ['cat-file', '-e', `${sha}^{commit}`], {
        cwd: checkout,
        encoding: 'utf8',
    });
    if (hasCommit.status !== 0) {
        const fetchedCommit = spawnSync('git', ['fetch', 'origin', sha], {
            cwd: checkout,
            encoding: 'utf8',
        });
        if (fetchedCommit.status !== 0) {
            return null;
        }
    }
    return sha;
};

const defaultDiffNames = async (checkout, base, directory) => {
    const result = spawnSync('git', ['diff', '--name-only', base, '--', directory], {
        cwd: checkout,
        encoding: 'utf8',
    });
    if (result.status !== 0) {
        throw new Error(`git diff ${base} -- ${directory} failed: ${result.stderr}`);
    }
    return result.stdout.split('\n').map(line => line.trim()).filter(Boolean);
};

if (import.meta.main) {
    await main().catch(error => {
        console.error(error instanceof Error ? error.message : 'Version bump backstop failed.');
        process.exit(1);
    });
}
