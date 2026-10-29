import { useCallback, useEffect, useSyncExternalStore } from 'react';
import {
    applyTheme,
    type ResolvedTheme,
    readThemePreference,
    resolveTheme,
    subscribeToSystemTheme,
    type ThemePreference,
    writeThemePreference,
} from '@/lib/theme';

/**
 * The theme preference is an external store (localStorage plus the system
 * color scheme), so every caller reads the same value without a provider.
 */
export const useTheme = () => {
    const theme = useSyncExternalStore(subscribe, readThemePreference, serverPreference);
    const resolvedTheme: ResolvedTheme = useSyncExternalStore(
        subscribe,
        () => resolveTheme(readThemePreference()),
        serverTheme
    );

    useEffect(() => {
        applyTheme(theme);
        if (theme !== 'system') {
            return;
        }
        return subscribeToSystemTheme(() => applyTheme('system'));
    }, [theme]);

    const setTheme = useCallback((next: ThemePreference) => {
        writeThemePreference(next);
        applyTheme(next);
        notify();
    }, []);

    return { resolvedTheme, setTheme, theme };
};

// Static renders (tests) have no storage or media queries.
const serverPreference = (): ThemePreference => 'system';
const serverTheme = (): ResolvedTheme => 'light';

let listeners: ReadonlyArray<() => void> = [];

const subscribe = (listener: () => void) => {
    listeners = [...listeners, listener];
    const unsubscribeSystem = subscribeToSystemTheme(listener);
    return () => {
        listeners = listeners.filter(current => current !== listener);
        unsubscribeSystem();
    };
};

const notify = () => {
    for (const listener of listeners) {
        listener();
    }
};
