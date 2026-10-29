import { useEffect, useRef } from 'react';
import { hasCommandModifier, isTypingTarget } from './is-typing-target';

/**
 * The grid screens' row cursor: `j`/`k` (and ↑/↓ while focus is outside
 * the grid, which handles its own arrows) move the selection one row, Enter
 * (outside the grid, or on a focused row) opens the selected row, and `keys` adds single-key actions
 * (`a` for Amazon). The moved-to row takes focus, so the grid's own arrows and
 * Enter continue from it. Rows are found by a cell carrying `attribute`.
 */
export const useRowCursor = ({
    attribute,
    ids,
    keys,
    onOpen,
    onSelect,
    selectedId,
}: {
    attribute: string;
    ids: readonly string[];
    keys?: Readonly<Record<string, (id: string) => void>>;
    onOpen?: (id: string) => void;
    onSelect: (id: string) => void;
    selectedId: string | null;
}) => {
    // The listener is installed once; it reads the latest values from here.
    const latest = useRef({ attribute, ids, keys, onOpen, onSelect, selectedId });
    latest.current = { attribute, ids, keys, onOpen, onSelect, selectedId };

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (hasCommandModifier(event) || isTypingTarget(event.target)) {
                return;
            }
            const current = latest.current;
            const inGrid = event.target instanceof Element && event.target.closest('[role="grid"]');
            const step = stepFor(event.key, Boolean(inGrid));
            if (step !== 0) {
                // Captured before the grid sees it, so its typeahead never takes `j`/`k`.
                event.preventDefault();
                event.stopPropagation();
                const index = current.selectedId ? current.ids.indexOf(current.selectedId) : -1;
                const next =
                    current.ids[Math.min(current.ids.length - 1, Math.max(0, index + step))];
                if (next && next !== current.selectedId) {
                    current.onSelect(next);
                    focusRow(current.attribute, next);
                }
                return;
            }
            if (!current.selectedId) {
                return;
            }
            // In the grid, toggle selection leaves ⏎ on a focused row to us (a click still acts).
            const onRow = event.target instanceof Element && event.target.matches('[role="row"]');
            if (event.key === 'Enter' && (!inGrid || onRow) && current.onOpen) {
                event.preventDefault();
                current.onOpen(current.selectedId);
                return;
            }
            const action = current.keys?.[event.key];
            if (action) {
                event.preventDefault();
                event.stopPropagation();
                action(current.selectedId);
            }
        };
        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, []);
};

const stepFor = (key: string, inGrid: boolean) => {
    if (key === 'j' || (!inGrid && key === 'ArrowDown')) {
        return 1;
    }
    if (key === 'k' || (!inGrid && key === 'ArrowUp')) {
        return -1;
    }
    return 0;
};

/** Focuses the row whose cell carries `attribute` = `id`, scrolling it into view. */
export const focusRow = (attribute: string, id: string) => {
    const cell = document.querySelector(`[${attribute}="${CSS.escape(id)}"]`);
    const row = cell?.closest<HTMLElement>('[role="row"]');
    if (!row) {
        return;
    }
    row.focus({ preventScroll: true });
    row.scrollIntoView({ block: 'nearest' });
};
