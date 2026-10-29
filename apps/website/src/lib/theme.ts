export type ThemePreference = 'dark' | 'light' | 'system';
export type ResolvedTheme = Exclude<ThemePreference, 'system'>;

const storageKey = 'rw-theme';
const darkQuery = '(prefers-color-scheme: dark)';

export const readThemePreference = (): ThemePreference => {
    const stored = readStorage();
    return stored === 'dark' || stored === 'light' || stored === 'system' ? stored : 'system';
};

export const writeThemePreference = (theme: ThemePreference) => {
    try {
        window.localStorage.setItem(storageKey, theme);
    } catch {
        // Storage can be unavailable (private mode); the theme still applies for the session.
    }
};

export const resolveTheme = (theme: ThemePreference): ResolvedTheme => {
    if (theme !== 'system') {
        return theme;
    }
    return window.matchMedia(darkQuery).matches ? 'dark' : 'light';
};

/**
 * HeroUI reads the theme from three places, so all three move together: the
 * `data-theme` attribute and `.dark` class select its token blocks, and
 * `color-scheme` drives native controls and scrollbars.
 */
export const applyTheme = (theme: ThemePreference) => {
    const resolved = resolveTheme(theme);
    const root = document.documentElement;
    root.dataset.theme = resolved;
    root.style.colorScheme = resolved;
    root.classList.toggle('dark', resolved === 'dark');
    return resolved;
};

export const subscribeToSystemTheme = (listener: () => void) => {
    const media = window.matchMedia(darkQuery);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
};

const readStorage = () => {
    try {
        return window.localStorage.getItem(storageKey);
    } catch {
        return null;
    }
};
