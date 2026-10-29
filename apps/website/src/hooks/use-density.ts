import { useCallback, useSyncExternalStore } from 'react';
import { applyDensity, type Density, readDensity, writeDensity } from '@/lib/density';

/**
 * The global row density as an external store, so the Explore toggle and
 * Settings › General read and write the same value without a provider.
 */
export const useDensity = () => {
    const density = useSyncExternalStore(subscribe, readDensity, serverDensity);
    const setDensity = useCallback((next: Density) => {
        writeDensity(next);
        applyDensity(next);
        notify();
    }, []);
    return { density, setDensity };
};

// Static renders (tests) have no storage.
const serverDensity = (): Density => 'comfortable';

let listeners: ReadonlyArray<() => void> = [];

const subscribe = (listener: () => void) => {
    listeners = [...listeners, listener];
    return () => {
        listeners = listeners.filter(current => current !== listener);
    };
};

const notify = () => {
    for (const listener of listeners) {
        listener();
    }
};
