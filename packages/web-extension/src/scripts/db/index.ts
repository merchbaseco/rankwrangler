import Dexie, { type Table } from "dexie";

export interface ProductRequestTableSchema {
	asin: string;
	marketplaceId: string;
	startedAt: string;
}

export interface CachedProductTableSchema {
	asin: string;
	marketplaceId: string;
	product: object;
	expiresAt: Date;
}

class RankWranglerDB extends Dexie {
	productRequests!: Table<ProductRequestTableSchema, [string, string]>;
	cachedProducts!: Table<CachedProductTableSchema, [string, string]>;

	constructor() {
		super("RankWranglerDB");
		this.version(1).stores({
			productRequests: "[asin+marketplaceId]",
			cachedProducts: "[asin+marketplaceId], expiresAt",
		});
	}
}

export const db = new RankWranglerDB();
