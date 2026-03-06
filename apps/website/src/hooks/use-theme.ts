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

const isDarkTheme = (theme: Theme) => {
	if (theme === "dark") {
		return true;
	}
	if (theme === "light") {
		return false;
	}
	return window.matchMedia("(prefers-color-scheme: dark)").matches;
};

const applyTheme = (theme: Theme) => {
	document.documentElement.classList.toggle("dark", isDarkTheme(theme));
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

	const setTheme = useCallback((next: Theme) => {
		commitTheme(next);
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
