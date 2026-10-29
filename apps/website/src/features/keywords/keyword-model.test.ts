import { describe, expect, test } from 'bun:test';
import { keywordSortForColumn } from './keyword-columns';
import { formatAgo, normalizeTerm } from './keyword-model';

describe('keyword model', () => {
    test('formats a last check relative to now', () => {
        const now = Date.parse('2026-10-27T12:00:00Z');
        expect(formatAgo('2026-10-27T11:48:00Z', now)).toBe('12m ago');
        expect(formatAgo('2026-10-27T09:00:00Z', now)).toBe('3h ago');
        expect(formatAgo('2026-10-25T12:00:00Z', now)).toBe('2d ago');
        expect(formatAgo(null, now)).toBeNull();
    });

    test('research headers map to server sorts; the active one returns to the queue', () => {
        expect(keywordSortForColumn('score', 'work')).toBe('score');
        expect(keywordSortForColumn('median', 'work')).toBe('medianBsr');
        expect(keywordSortForColumn('score', 'score')).toBe('work');
        expect(keywordSortForColumn('keyword', 'work')).toBeNull();
    });

    test('normalizes a typed phrase like the directory stores it', () => {
        expect(normalizeTerm('  Dog   DAD ')).toBe('dog dad');
    });
});
