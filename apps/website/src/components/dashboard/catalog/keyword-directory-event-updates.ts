import type { RouterOutputs } from "@/lib/trpc";

type Page = RouterOutputs["api"]["app"]["keywordDirectory"];
type Event = RouterOutputs["api"]["app"]["keyword"]["directory"]["changed"];
type Dependencies = {
	view: () => Page["view"] | undefined;
	read: (terms: string[], view: Page["view"]) => Promise<Page["items"]>;
	// Returns false when the cache is mid-fetch; a page arriving later would overwrite the patch.
	patch: (rows: Page["items"], terms: string[]) => boolean;
	reconcile: () => Promise<unknown>;
};
export const createKeywordDirectoryEventUpdates = (deps: Dependencies) => {
	const pending = new Set<string>();
	let timer: ReturnType<typeof setTimeout> | null = null;
	let running = false;
	let disposed = false;
	let revision = 0;
	let resync = false;
	const flush = async () => {
		timer = null;
		if (running || disposed) return;
		running = true;
		try {
			while (!disposed && (resync || pending.size)) {
				if (resync) {
					resync = false;
					await deps.reconcile();
					continue;
				}
				const terms = [...pending].slice(0, 100);
				for (const term of terms) pending.delete(term);
				const version = revision;
				let view = deps.view();
				if (!view) {
					await deps.reconcile();
					view = deps.view();
				}
				if (!view) continue;
				const rows = await deps.read(terms, view);
				if (disposed || version !== revision || deps.patch(rows, terms)) continue;
				for (const term of terms) pending.add(term);
				break;
			}
		} catch {
			pending.clear();
			if (!disposed) await deps.reconcile().catch(() => undefined);
		} finally {
			running = false;
			if (!disposed && (resync || pending.size) && !timer)
				timer = setTimeout(() => {
					void flush();
				}, 75);
		}
	};
	return {
		onData: (event: Event) => {
			if (disposed) return;
			if (event.kind === "resync") {
				revision += 1;
				pending.clear();
				resync = true;
			} else for (const term of event.data.terms) pending.add(term);
			if (!timer && !running)
				timer = setTimeout(() => {
					void flush();
				}, 75);
		},
		dispose: () => {
			disposed = true;
			revision += 1;
			pending.clear();
			if (timer) clearTimeout(timer);
		},
	};
};
