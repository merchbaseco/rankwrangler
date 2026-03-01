#!/usr/bin/env node

import {
    compareVersions,
    fail,
    isSemver,
    parseVersion,
    readJson,
    readText,
    updateJson,
} from './release-utils.mjs';

const versionedPackagePaths = [
    'apps/server/package.json',
    'packages/http-client/package.json',
    'packages/cli/package.json',
];

const changelogPath = 'CHANGELOG.md';
const httpClientDependencyConsumers = [
    'packages/cli/package.json',
    'apps/extension/package.json',
];

const releaseType = process.argv[2];

if (!releaseType || releaseType === '--help' || releaseType === '-h') {
    printUsage();
    process.exit(releaseType ? 0 : 1);
}

const main = async () => {
    const currentVersion = await readCurrentVersion();
    const latestChangelogVersion = await readLatestChangelogVersion();

    if (latestChangelogVersion !== currentVersion) {
        fail(
            `latest changelog version (${latestChangelogVersion}) must match current package version (${currentVersion}) before bumping`,
        );
    }

    const targetVersion = resolveTargetVersion(currentVersion, releaseType);

    if (targetVersion === currentVersion) {
        fail(`target version ${targetVersion} matches current version`);
    }

    if (compareVersions(targetVersion, currentVersion) <= 0) {
        fail(`target version ${targetVersion} must be greater than current ${currentVersion}`);
    }

    await updateVersionedPackages(targetVersion);
    await updateHttpClientDependencies(targetVersion);

    printSummary({ currentVersion, targetVersion });
};

await main();

function printUsage() {
    console.log([
        'Usage: bun run release:bump <patch|minor|major|X.Y.Z>',
        '',
        'Examples:',
        '  bun run release:bump patch',
        '  bun run release:bump 0.2.3',
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

    const [version] = unique;
    if (!isSemver(version)) {
        fail(`invalid current version: ${version}`);
    }

    return version;
}

async function readLatestChangelogVersion() {
    const changelog = await readText(changelogPath);
    if (/(^|\n)## Unreleased\s*$/m.test(changelog)) {
        fail('CHANGELOG.md must not contain ## Unreleased');
    }

    const match = changelog.match(/^## v(\d+\.\d+\.\d+) - (\d{4}-\d{2}-\d{2})$/m);
    if (!match) {
        fail('could not find latest release heading in CHANGELOG.md');
    }

    return match[1];
}

function resolveTargetVersion(currentVersion, input) {
    if (input === 'patch' || input === 'minor' || input === 'major') {
        return bumpVersion(currentVersion, input);
    }

    if (!isSemver(input)) {
        fail(`invalid target version: ${input}`);
    }

    return input;
}

function bumpVersion(version, type) {
    const parsed = parseVersion(version);
    if (!parsed) {
        fail(`invalid current version: ${version}`);
    }

    if (type === 'patch') {
        return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
    }

    if (type === 'minor') {
        return `${parsed.major}.${parsed.minor + 1}.0`;
    }

    return `${parsed.major + 1}.0.0`;
}

async function updateVersionedPackages(targetVersion) {
    await Promise.all(
        versionedPackagePaths.map(packagePath => {
            return updateJson(packagePath, packageJson => {
                packageJson.version = targetVersion;
                return packageJson;
            });
        }),
    );
}

async function updateHttpClientDependencies(targetVersion) {
    const nextDependencyVersion = `^${targetVersion}`;

    await Promise.all(
        httpClientDependencyConsumers.map(packagePath => {
            return updateJson(packagePath, packageJson => {
                if (!packageJson.dependencies || !packageJson.dependencies['@rankwrangler/http-client']) {
                    fail(`${packagePath} missing @rankwrangler/http-client dependency`);
                }

                packageJson.dependencies['@rankwrangler/http-client'] = nextDependencyVersion;
                return packageJson;
            });
        }),
    );
}

function printSummary({ currentVersion, targetVersion }) {
    console.log(`Bumped release version ${currentVersion} -> ${targetVersion}`);
    console.log('Updated files:');
    for (const packagePath of versionedPackagePaths) {
        console.log(`- ${packagePath}`);
    }

    for (const packagePath of httpClientDependencyConsumers) {
        console.log(`- ${packagePath}`);
    }

    console.log('Next:');
    console.log('- bun install');
    console.log('- bun run release:collect-changelog-context');
    console.log('- update CHANGELOG.md using commit analysis');
    console.log('- bun run release:check');
}
