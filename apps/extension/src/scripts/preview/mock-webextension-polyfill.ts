type MessageListener = (
	message: unknown,
	sender: unknown
) => unknown | Promise<unknown>;

const listeners: MessageListener[] = [];
const localStore = new Map<string, unknown>();

const storageLocal = {
	get(keys?: string[] | string | Record<string, unknown>) {
		if (keys == null) {
			return Promise.resolve(Object.fromEntries(localStore.entries()));
		}

		if (typeof keys === "string") {
			return Promise.resolve({ [keys]: localStore.get(keys) });
		}

		if (Array.isArray(keys)) {
			return Promise.resolve(
				Object.fromEntries(keys.map((key) => [key, localStore.get(key)]))
			);
		}

		const result: Record<string, unknown> = {};
		for (const [key, fallback] of Object.entries(keys)) {
			result[key] = localStore.has(key) ? localStore.get(key) : fallback;
		}
		return Promise.resolve(result);
	},
	set(values: Record<string, unknown>) {
		for (const [key, value] of Object.entries(values)) {
			localStore.set(key, value);
		}
		return Promise.resolve();
	},
};

export const browser = {
	runtime: {
		sendMessage() {
			return Promise.resolve(null);
		},
		onMessage: {
			addListener(listener: MessageListener) {
				listeners.push(listener);
			},
			removeListener(listener: MessageListener) {
				const index = listeners.indexOf(listener);
				if (index >= 0) {
					listeners.splice(index, 1);
				}
			},
		},
	},
	storage: {
		local: storageLocal,
	},
	tabs: {
		query() {
			return Promise.resolve([]);
		},
	},
	scripting: {
		executeScript() {
			return Promise.resolve([]);
		},
	},
};

export default browser;
