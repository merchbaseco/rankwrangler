#!/usr/bin/env node

import {
    compareVersions,
    fail,
    findSingleGitLine,
    readFlagValue,
    readJson,
    readText,
    runGit,
} from './release-utils.mjs';

const argv = process.argv.slice(2);
const sinceRef = readFlagValue(argv, '--since-ref');
const maxCommits = readMaxCommits(argv);

const versionedPackagePaths = [
    'apps/server/package.json',
    'packages/http-client/package.json',
    'packages/cli/package.json',
];

if (argv.includes('--help') || argv.includes('-h')) {
    printUsage();
    process.exit(0);
}

const main = async () => {
    const targetVersion = await readCurrentVersion();
    const latestChangelogVersion = await readLatestChangelogVersion();

    if (compareVersions(targetVersion, latestChangelogVersion) <= 0) {
        fail(
            `package version ${targetVersion} must be greater than changelog latest ${latestChangelogVersion}. Run release:bump first.`,
        );
    }

    const baseRef = sinceRef ?? (await detectReleaseBaseRef(latestChangelogVersion));
    if (!baseRef) {
        fail(`could not determine base ref for ${latestChangelogVersion}; use --since-ref <git-ref>`);
    }

    const commits = await readCommits(baseRef, maxCommits);
    printContext({
        targetVersion,
        previousVersion: latestChangelogVersion,
        baseRef,
        commitCount: commits.length,
        commits,
    });
};

await main();

function printUsage() {
    console.log([
        'Usage: bun run release:collect-changelog-context [--since-ref <git-ref>] [--max-commits <N>]',
        '',
        'Examples:',
        '  bun run release:collect-changelog-context',
        '  bun run release:collect-changelog-context --since-ref v0.2.2',
    ].join('\n'));
}

async function readCurrentVersion() {
    const versions = await Promise.all(
        versionedPackagePaths.map(async packagePath => {
            const packageJson = await readJson(packagePath);
            return packageJson.version;
        }),
    );

    const unique = new Set(versions);
    if (unique.size !== 1) {
        fail('versioned package versions are not synchronized', {
            paths: versionedPackagePaths,
            versions,
        });
    }

    return versions[0];
}

async function readLatestChangelogVersion() {
    const changelog = await readText('CHANGELOG.md');
    if (/(^|\n)## Unreleased\s*$/m.test(changelog)) {
        fail('CHANGELOG.md must not contain ## Unreleased');
    }

    const match = changelog.match(/^## v(\d+\.\d+\.\d+) - (\d{4}-\d{2}-\d{2})$/m);
    if (!match) {
        fail('could not find latest release heading in CHANGELOG.md');
    }

    return match[1];
}

async function detectReleaseBaseRef(version) {
    const releaseCommit = await findSingleGitLine([
        'log',
        '--format=%H',
        '--grep',
        `^release: v${version}$`,
        '-n',
        '1',
    ]);
    if (releaseCommit) {
        return releaseCommit;
    }

    const tag = await findSingleGitLine(['tag', '--list', `v${version}`]);
    if (tag) {
        return tag;
    }

    return null;
}

async function readCommits(baseRef, max) {
    const { stdout } = await runGit([
        'log',
        '--no-merges',
        '--date=short',
        '--format=%h%x09%ad%x09%s',
        '--max-count',
        `${max}`,
        `${baseRef}..HEAD`,
    ]);

    return stdout
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => {
            const [hash, date, ...subjectParts] = line.split('\t');
            return {
                hash,
                date,
                subject: subjectParts.join('\t').trim(),
            };
        });
}

function readMaxCommits(args) {
    const value = readFlagValue(args, '--max-commits');
    if (!value) {
        return 200;
    }

    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 1000) {
        fail('--max-commits must be an integer between 1 and 1000');
    }

    return parsed;
}

function printContext({ targetVersion, previousVersion, baseRef, commitCount, commits }) {
    console.log(`# Release Changelog Context`);
    console.log('');
    console.log(`- Target version: ${targetVersion}`);
    console.log(`- Previous release in changelog: ${previousVersion}`);
    console.log(`- Commit range: ${baseRef}..HEAD`);
    console.log(`- Commits in range (no merges): ${commitCount}`);
    console.log('');
    console.log('## Commit Subjects');
    console.log('');

    if (commits.length === 0) {
        console.log('- No commits found in range.');
        return;
    }

    for (const commit of commits) {
        console.log(`- ${commit.hash} ${commit.date} ${commit.subject}`);
    }

    console.log('');
    console.log('## AI Changelog Writing Guidance');
    console.log('');
    console.log('- Group commits by user-facing outcome, not commit order.');
    console.log('- Ignore purely internal churn unless it affects behavior.');
    console.log('- Prefer concise bullets in Added/Changed/Fixed.');
    console.log('- Call out any breaking changes explicitly.');
}
