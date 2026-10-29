import { useCallback, useEffect, useState } from 'react';

/**
 * The content width of an element, kept current by a ResizeObserver, for
 * drawings that lay out in real pixels (dot bands stay round only at their
 * drawn size). Attach the returned ref callback; the width is 0 until measured.
 */
export const useElementWidth = <T extends HTMLElement>() => {
    const [element, setElement] = useState<T | null>(null);
    const [width, setWidth] = useState(0);
    useEffect(() => {
        if (!element) {
            return;
        }
        const observer = new ResizeObserver(([entry]) => {
            setWidth(Math.floor(entry?.contentRect.width ?? 0));
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, [element]);
    const ref = useCallback((node: T | null) => setElement(node), []);
    return { ref, width };
};
