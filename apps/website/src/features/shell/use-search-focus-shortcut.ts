import { useEffect } from 'react';
import { hasCommandModifier, isTypingTarget } from './is-typing-target';

/**
 * ⌘K (Ctrl+K) anywhere, or `/` outside a text field, puts the caret in the
 * banner's search and selects what is there. Esc in the search
 * leaves it (keeping what was typed) and hands focus back to the table's
 * selected row, so j/k and ⏎ drive the table again.
 */
export const useSearchFocusShortcut = (selector: string) => {
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (
                event.key === 'Escape' &&
                event.target instanceof HTMLInputElement &&
                event.target.matches(selector)
            ) {
                // Captured ahead of the field, whose own Escape would clear it.
                event.preventDefault();
                event.stopPropagation();
                event.target.blur();
                focusTable();
                return;
            }
            const isCommandK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
            const isSlash =
                event.key === '/' && !hasCommandModifier(event) && !isTypingTarget(event.target);
            if (!(isCommandK || isSlash)) {
                return;
            }
            const input = document.querySelector<HTMLInputElement>(selector);
            if (!input) {
                return;
            }
            event.preventDefault();
            input.focus();
            input.select();
        };
        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, [selector]);
};

const focusTable = () => {
    const row =
        document.querySelector<HTMLElement>('[role="grid"] [role="row"][aria-selected="true"]') ??
        document.querySelector<HTMLElement>('[role="grid"]');
    row?.focus({ preventScroll: true });
};
