/**
 * Whether a key event lands where the person is typing (a text field, an
 * editable region, an open menu's typeahead), so single-key shortcuts like `/`,
 * `j` or `g e` leave it alone.
 */
export const isTypingTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) {
        return false;
    }
    if (target.isContentEditable) {
        return true;
    }
    if (target.closest('[role="menu"], [role="listbox"], [role="dialog"]')) {
        return true;
    }
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
};

/** A key with a modifier other than Shift belongs to the browser or OS. */
export const hasCommandModifier = (event: KeyboardEvent) =>
    event.metaKey || event.ctrlKey || event.altKey;
