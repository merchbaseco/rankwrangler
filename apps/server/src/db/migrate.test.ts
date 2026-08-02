import { describe, expect, test } from 'bun:test';
import { resolveMigrationTargetForCommand, selectMigrationEntries } from './migrate';

const entries = [
    {
        breakpoints: true,
        idx: 27,
        tag: '0027_ambiguous_venus',
        version: '7',
        when: 1,
    },
    {
        breakpoints: true,
        idx: 28,
        tag: '0028_groovy_black_tom',
        version: '7',
        when: 2,
    },
    {
        breakpoints: true,
        idx: 29,
        tag: '0029_future_schema',
        version: '7',
        when: 3,
    },
] as const;

describe('migration deployment target', () => {
    test('stops before the guarded cutover and every migration after it', () => {
        expect(selectMigrationEntries(entries, 'pre-cutover').map(entry => entry.tag)).toEqual([
            '0027_ambiguous_venus',
        ]);
    });

    test('applies the guarded cutover and subsequent migrations only for latest', () => {
        expect(selectMigrationEntries(entries, 'latest')).toEqual(entries);
    });

    test('fails closed when the guarded cutover migration is missing', () => {
        expect(() => selectMigrationEntries(entries.slice(0, 1), 'pre-cutover')).toThrow(
            'Missing guarded migration 0028_groovy_black_tom.'
        );
    });

    test('caps projection bootstrap migrations at pre-cutover', () => {
        expect(resolveMigrationTargetForCommand(['--bootstrap-access-projection'], 'latest')).toBe(
            'pre-cutover'
        );
        expect(resolveMigrationTargetForCommand(['--migrate-only'], 'latest')).toBe('latest');
    });
});
