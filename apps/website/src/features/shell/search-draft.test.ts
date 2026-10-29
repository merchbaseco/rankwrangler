import { describe, expect, test } from 'bun:test';
import {
    hasUnpushedDraft,
    initialSearchDraft,
    reduceSearchDraft,
    type SearchDraftEvent,
} from './search-draft';

const run = (events: readonly SearchDraftEvent[], url = '') =>
    events.reduce(reduceSearchDraft, initialSearchDraft(url));

describe('search draft', () => {
    test('fast typing keeps every keystroke while late URL updates arrive', () => {
        // "c" settles and is pushed, then "a", "t" land before the URL echoes "c".
        const state = run([
            { focused: true, type: 'focus' },
            { type: 'type', value: 'c' },
            { type: 'commit' },
            { type: 'type', value: 'ca' },
            { type: 'type', value: 'cat' },
            { type: 'url', value: 'c' },
        ]);
        expect(state.draft).toBe('cat');
        expect(hasUnpushedDraft(state)).toBe(true);
    });

    test('a stale echo of an older push never rewinds the focused input', () => {
        const state = run([
            { focused: true, type: 'focus' },
            { type: 'type', value: 'c' },
            { type: 'commit' },
            { type: 'type', value: 'ca' },
            { type: 'commit' },
            { type: 'type', value: 'cat' },
            { type: 'url', value: 'c' },
            { type: 'url', value: 'ca' },
        ]);
        expect(state.draft).toBe('cat');
    });

    test('outside navigation replaces the draft when the input is not focused', () => {
        const state = run(
            [
                { type: 'type', value: 'fish' },
                { type: 'commit' },
                { type: 'url', value: 'fish' },
                { type: 'url', value: 'nurse' },
            ],
            ''
        );
        expect(state.draft).toBe('nurse');
        expect(hasUnpushedDraft(state)).toBe(false);
    });

    test('a pushed draft is settled once the URL catches up', () => {
        const state = run([
            { type: 'type', value: 'pickle' },
            { type: 'commit' },
            { type: 'url', value: 'pickle' },
        ]);
        expect(state).toEqual({
            draft: 'pickle',
            focused: false,
            pushed: 'pickle',
            seenUrl: 'pickle',
        });
    });
});
