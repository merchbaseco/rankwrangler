/**
 * The banner's views. Built views carry an href and a `g` sequence
 * (Linear/GitHub style: `g` then `e` opens Explore); views without an href are
 * not built yet.
 */
export const views = [
    { href: '/explore', id: 'explore', label: 'Explore', shortcut: 'e' },
    { href: '/keywords', id: 'keywords', label: 'Keywords', shortcut: 'k' },
    { href: null, id: 'niches', label: 'Niches', shortcut: null },
    { href: null, id: 'movers', label: 'Movers', shortcut: null },
] as const;

/**
 * A Product is reached from Explore, so Explore stays selected there. Any
 * other route (Logs) returns its own key: a controlled key no tab carries
 * leaves the list unselected, where `null` would make React Aria select the
 * first tab.
 */
export const resolveSelectedView = (pathname: string) => {
    if (pathname.startsWith('/explore') || pathname.startsWith('/products/')) {
        return 'explore';
    }
    if (pathname.startsWith('/keywords')) {
        return 'keywords';
    }
    return pathname;
};
