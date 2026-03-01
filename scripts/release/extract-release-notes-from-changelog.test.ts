import { describe, expect, it } from 'bun:test';
import { extractReleaseNotesFromChangelog } from './extract-release-notes-from-changelog.mjs';

const changelogFixture = `# Changelog

All notable changes to this project will be documented in this file.

## v1.2.0 - 2026-03-01

### Added

- Add release-notes automation.

### Fixed

- Fix workflow metadata.

## v1.1.9 - 2026-02-25

### Changed

- Improve changelog clarity.
`;

describe('extractReleaseNotesFromChangelog', () => {
    it('returns the matching release heading and section body for a v-prefixed tag', () => {
        const notes = extractReleaseNotesFromChangelog(changelogFixture, 'v1.2.0');

        expect(notes).toContain('## v1.2.0 - 2026-03-01');
        expect(notes).toContain('### Added');
        expect(notes).toContain('### Fixed');
        expect(notes).not.toContain('## v1.1.9 - 2026-02-25');
    });

    it('accepts a tag without a v prefix', () => {
        const notes = extractReleaseNotesFromChangelog(changelogFixture, '1.1.9');

        expect(notes).toContain('## v1.1.9 - 2026-02-25');
        expect(notes).toContain('### Changed');
    });

    it('throws when the requested tag does not exist in CHANGELOG content', () => {
        expect(() => extractReleaseNotesFromChangelog(changelogFixture, 'v9.9.9')).toThrow(
            'could not find changelog entry for v9.9.9',
        );
    });
});
