import { pathToFileURL } from 'node:url';
import { fail, readFlagValue, readText, writeText } from './release-utils.mjs';

const changelogPath = 'CHANGELOG.md';
const defaultOutputPath = '.github-release-notes.md';

export const extractReleaseNotesFromChangelog = (changelog, tagName) => {
    const version = normalizeTagVersion(tagName);
    const headings = collectReleaseHeadings(changelog);
    const releaseIndex = headings.findIndex(entry => entry.version === version);

    if (releaseIndex === -1) {
        throw new Error(`could not find changelog entry for v${version}`);
    }

    const release = headings[releaseIndex];
    const nextRelease = headings[releaseIndex + 1];
    const sectionEnd = nextRelease ? nextRelease.headingStart : changelog.length;
    const sectionBody = changelog.slice(release.sectionStart, sectionEnd).trim();

    if (!sectionBody) {
        throw new Error(`changelog entry for v${version} has no body`);
    }

    return `${release.heading}\n\n${sectionBody}`;
};

const main = async () => {
    const args = process.argv.slice(2);
    if (args.includes('--help') || args.includes('-h')) {
        printUsage();
        process.exit(0);
    }

    const tagName = readFlagValue(args, '--tag') ?? process.env.GITHUB_REF_NAME;
    if (!tagName) {
        fail('missing --tag and GITHUB_REF_NAME is not set');
    }

    const outputPath = readFlagValue(args, '--output') ?? defaultOutputPath;

    try {
        const changelog = await readText(changelogPath);
        const notes = extractReleaseNotesFromChangelog(changelog, tagName);
        await writeText(outputPath, `${notes}\n`);
        console.log(`wrote GitHub release notes for ${tagName} -> ${outputPath}`);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        fail(message, { tagName, changelogPath });
    }
};

const collectReleaseHeadings = changelog => {
    const headingPattern = /^## v(\d+\.\d+\.\d+) - (\d{4}-\d{2}-\d{2})$/gm;
    const entries = [];
    let match = headingPattern.exec(changelog);

    while (match) {
        entries.push({
            version: match[1],
            heading: match[0],
            headingStart: match.index,
            sectionStart: headingPattern.lastIndex,
        });
        match = headingPattern.exec(changelog);
    }

    return entries;
};

const normalizeTagVersion = tagName => {
    const normalized = tagName.startsWith('v') ? tagName.slice(1) : tagName;
    if (!/^\d+\.\d+\.\d+$/.test(normalized)) {
        throw new Error(`tag must be semver with optional v prefix; received "${tagName}"`);
    }

    return normalized;
};

const printUsage = () => {
    console.log('Usage: node scripts/release/extract-release-notes-from-changelog.mjs [options]');
    console.log('');
    console.log('Options:');
    console.log('  --tag <vX.Y.Z>         Release tag to extract (defaults to GITHUB_REF_NAME)');
    console.log(`  --output <path>        Output path (default: ${defaultOutputPath})`);
};

if (process.argv[1]) {
    const scriptUrl = pathToFileURL(process.argv[1]).href;
    if (import.meta.url === scriptUrl) {
        await main();
    }
}
