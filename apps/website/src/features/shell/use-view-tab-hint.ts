import { useCallback, useEffect, useRef, useState } from 'react';
import { views } from './view-tabs-model';

/** Matches HeroUI's tooltip open delay, so the view tabs feel like every other tooltip. */
const HINT_DELAY_MS = 700;

type BuiltView = Extract<(typeof views)[number], { href: string }>;

/**
 * Which view tab's shortcut hint is showing, and the tab element it anchors to.
 * Hover arms a delayed open; leaving or pressing the tab closes it at once.
 */
export const useViewTabHint = () => {
    const anchorRef = useRef<Element | null>(null);
    const timer = useRef<number | undefined>(undefined);
    const [view, setView] = useState<BuiltView | null>(null);

    const hide = useCallback(() => {
        window.clearTimeout(timer.current);
        setView(null);
    }, []);
    const show = useCallback((id: BuiltView['id'], target: Element) => {
        window.clearTimeout(timer.current);
        anchorRef.current = target;
        timer.current = window.setTimeout(() => setView(findView(id)), HINT_DELAY_MS);
    }, []);
    useEffect(() => () => window.clearTimeout(timer.current), []);

    return { anchorRef, hide, show, view };
};

const findView = (id: BuiltView['id']) =>
    views.find((view): view is BuiltView => view.id === id && view.href !== null) ?? null;
