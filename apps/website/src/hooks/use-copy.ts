import { useCallback, useState } from "react";

export function useCopy(timeoutMs: number = 1800) {
	const [copied, setCopied] = useState(false);

	const copy = useCallback(
		async (value: string) => {
			if (!value) return false;
			try {
				await navigator.clipboard.writeText(value);
				setCopied(true);
				window.setTimeout(() => setCopied(false), timeoutMs);
				return true;
			} catch {
				return false;
			}
		},
		[timeoutMs],
	);

	return { copied, copy };
}
