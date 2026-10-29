import { useCallback, useEffect, useReducer } from 'react';
import { hasUnpushedDraft, initialSearchDraft, reduceSearchDraft } from './search-draft';

/**
 * Local state for the shell's search pill: typing updates the input at once,
 * the URL gets the draft after `delayMs` of quiet, and an outside URL change
 * (back/forward, "filter to") replaces the draft only while it is not focused.
 */
export const useSearchDraft = (
    urlValue: string,
    onCommit: (value: string) => void,
    delayMs = 250
) => {
    const [state, dispatch] = useReducer(reduceSearchDraft, urlValue, initialSearchDraft);

    // Render-time reconciliation with the URL; the reducer ignores a repeat.
    if (urlValue !== state.seenUrl) {
        dispatch({ type: 'url', value: urlValue });
    }

    const pending = hasUnpushedDraft(state);
    useEffect(() => {
        if (!pending) {
            return;
        }
        const timer = window.setTimeout(() => {
            dispatch({ type: 'commit' });
            onCommit(state.draft);
        }, delayMs);
        return () => window.clearTimeout(timer);
    }, [delayMs, onCommit, pending, state.draft]);

    const onChange = useCallback((value: string) => dispatch({ type: 'type', value }), []);
    const onFocusChange = useCallback(
        (focused: boolean) => dispatch({ focused, type: 'focus' }),
        []
    );

    /** Enter: push the draft now rather than after the quiet period. */
    const flush = useCallback(
        (value: string) => {
            dispatch({ type: 'type', value });
            dispatch({ type: 'commit' });
            onCommit(value);
        },
        [onCommit]
    );

    return { draft: state.draft, flush, onChange, onFocusChange };
};
