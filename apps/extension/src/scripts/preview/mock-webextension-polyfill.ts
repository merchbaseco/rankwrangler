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
		sendMessage(message: unknown) {
			if (isFetchProductHistoryMessage(message)) {
				return Promise.resolve({
					success: true,
					data: {
						marketplaceId: message.marketplaceId,
						asin: message.asin,
						metric: "bsrMain",
						latestImportAt: createDaysAgoIso(1),
						categoryNames: { "0": "Kitchen & Dining" },
						points: [
							createHistoryPoint(createDaysAgoIso(65), 72_410),
							createHistoryPoint(createDaysAgoIso(48), 64_220),
							createHistoryPoint(createDaysAgoIso(31), 58_970),
							createHistoryPoint(createDaysAgoIso(14), 61_305),
							createHistoryPoint(createDaysAgoIso(1), 53_841),
						],
						collecting: false,
						syncTriggered: false,
					},
				});
			}
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

const isFetchProductHistoryMessage = (
	message: unknown
): message is {
	type: "fetchProductHistory";
	asin: string;
	marketplaceId: string;
} =>
	typeof message === "object" &&
	message !== null &&
	"type" in message &&
	message.type === "fetchProductHistory" &&
	"asin" in message &&
	typeof message.asin === "string" &&
	"marketplaceId" in message &&
	typeof message.marketplaceId === "string";

const createHistoryPoint = (observedAt: string, value: number) => ({
	categoryId: 0,
	categoryName: "Kitchen & Dining",
	observedAt,
	keepaMinutes: 0,
	value,
	isMissing: false,
});

const createDaysAgoIso = (days: number) =>
	new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
