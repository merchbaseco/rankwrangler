export type Density = 'comfortable' | 'compact';

const storageKey = 'rw-density';

/**
 * Row density for every grid in the app, one per-browser setting. The theme's
 * density tokens (tokens.css) key off `data-density` on the root, so rows,
 * thumbnails and sparklines change together without any component knowing.
 */
export const readDensity = (): Density => {
    try {
        return window.localStorage.getItem(storageKey) === 'compact' ? 'compact' : 'comfortable';
    } catch {
        return 'comfortable';
    }
};

export const writeDensity = (density: Density) => {
    try {
        window.localStorage.setItem(storageKey, density);
    } catch {
        // Storage can be unavailable (private mode); the choice still holds for the session.
    }
};

export const applyDensity = (density: Density) => {
    document.documentElement.dataset.density = density;
};

export const isDensity = (value: unknown): value is Density =>
    value === 'comfortable' || value === 'compact';
