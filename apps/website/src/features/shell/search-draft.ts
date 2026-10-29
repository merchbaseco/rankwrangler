/**
 * The shell search pill's draft against the page's search value (the URL's
 * `?q=` on Explore). The input owns what is typed; the page only receives
 * settled drafts. A page value
 * is adopted into the input only when it is someone else's (back/forward, a
 * card's "filter to") and the input is not being typed in, so a late update
 * can never overwrite keystrokes that came after it.
 */
export interface SearchDraft {
    /** What the input shows. */
    readonly draft: string;
    /** The last draft pushed to the URL. */
    readonly pushed: string;
    /** The URL value this draft last reconciled with. */
    readonly seenUrl: string;
    readonly focused: boolean;
}

export type SearchDraftEvent =
    | { readonly type: 'type'; readonly value: string }
    | { readonly type: 'commit' }
    | { readonly type: 'url'; readonly value: string }
    | { readonly type: 'focus'; readonly focused: boolean };

export const initialSearchDraft = (url: string): SearchDraft => ({
    draft: url,
    focused: false,
    pushed: url,
    seenUrl: url,
});

export const reduceSearchDraft = (state: SearchDraft, event: SearchDraftEvent): SearchDraft => {
    switch (event.type) {
        case 'type':
            return { ...state, draft: event.value };
        case 'commit':
            return { ...state, pushed: state.draft };
        case 'focus':
            return { ...state, focused: event.focused };
        case 'url': {
            if (event.value === state.seenUrl) {
                return state;
            }
            const external = event.value !== state.pushed && !state.focused;
            return external
                ? { ...state, draft: event.value, pushed: event.value, seenUrl: event.value }
                : { ...state, seenUrl: event.value };
        }
        default:
            return assertNever(event);
    }
};

/** Whether the draft has settled text the URL does not have yet. */
export const hasUnpushedDraft = (state: SearchDraft) => state.draft !== state.pushed;

const assertNever = (value: never): never => {
    throw new Error(`Unhandled search draft event: ${JSON.stringify(value)}`);
};
