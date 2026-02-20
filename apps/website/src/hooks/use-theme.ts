import { useCallback, useEffect, useSyncExternalStore } from "react";

type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "rw-theme";

const getStoredTheme = (): Theme => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") {
        return stored;
    }
    return "system";
};

const applyTheme = (theme: Theme) => {
    const root = document.documentElement;
    if (theme === "system") {
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        root.classList.toggle("dark", prefersDark);
    } else {
        root.classList.toggle("dark", theme === "dark");
    }
};

let listeners: Array<() => void> = [];

const subscribe = (listener: () => void) => {
    listeners = [...listeners, listener];
    return () => {
        listeners = listeners.filter((l) => l !== listener);
    };
};

const notify = () => {
    for (const listener of listeners) {
        listener();
    }
};

const getSnapshot = () => getStoredTheme();

const commitTheme = (next: Theme) => {
    localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
    notify();
};

export const useTheme = () => {
    const theme = useSyncExternalStore(subscribe, getSnapshot);

    const setTheme = useCallback((next: Theme, event?: React.MouseEvent) => {
        const supportsViewTransitions = "startViewTransition" in document;

        if (!supportsViewTransitions || !event) {
            commitTheme(next);
            return;
        }

        const x = event.clientX;
        const y = event.clientY;
        const endRadius = Math.hypot(
            Math.max(x, window.innerWidth - x),
            Math.max(y, window.innerHeight - y),
        );

        const transition = document.startViewTransition(() => {
            commitTheme(next);
        });

        transition.ready.then(() => {
            document.documentElement.animate(
                {
                    clipPath: [
                        `circle(0px at ${x}px ${y}px)`,
                        `circle(${endRadius}px at ${x}px ${y}px)`,
                    ],
                },
                {
                    duration: 500,
                    easing: "ease-in-out",
                    pseudoElement: "::view-transition-new(root)",
                },
            );
        });
    }, []);

    useEffect(() => {
        applyTheme(theme);
    }, [theme]);

    useEffect(() => {
        const mq = window.matchMedia("(prefers-color-scheme: dark)");
        const handler = () => {
            if (getStoredTheme() === "system") {
                applyTheme("system");
            }
        };
        mq.addEventListener("change", handler);
        return () => mq.removeEventListener("change", handler);
    }, []);

    return { theme, setTheme };
};
