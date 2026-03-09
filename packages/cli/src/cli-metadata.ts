import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PACKAGE_JSON_PATH = fileURLToPath(new URL('../package.json', import.meta.url));
const CHANGELOG_PATH = fileURLToPath(new URL('./CHANGELOG.md', import.meta.url));
const RELEASE_HEADING_PATTERN = /^## v\d+\.\d+\.\d+ - \d{4}-\d{2}-\d{2}$/gm;

type PackageMetadata = {
    version: string;
};

export const printCliVersion = () => {
    const metadata = readPackageMetadata();
    console.log(metadata.version);
};

export const printBundledChangelog = () => {
    const changelog = readBundledChangelog();
    const latestEntry = extractLatestReleaseEntry(changelog);
    console.log(latestEntry);
};

const readPackageMetadata = (): PackageMetadata => {
    return JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf8')) as PackageMetadata;
};

const readBundledChangelog = () => {
    return readFileSync(CHANGELOG_PATH, 'utf8').trim();
};

const extractLatestReleaseEntry = (changelog: string) => {
    const matches = Array.from(changelog.matchAll(RELEASE_HEADING_PATTERN));
    if (matches.length === 0) {
        throw new Error('Bundled changelog is missing a release entry');
    }

    const latestMatch = matches[0];
    const nextMatch = matches[1];
    const start = latestMatch.index ?? 0;
    const end = nextMatch?.index ?? changelog.length;

    return changelog.slice(start, end).trim();
};
