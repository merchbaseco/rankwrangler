import { describe, expect, it, mock } from "bun:test";
import {
	seedCatalogProductQueries,
	selectFreshestProductRead,
} from "./use-seed-catalog-product-queries";

describe("Catalog Product query seeding", () => {
	it("updates every exact Product cache from the latest run snapshot", () => {
		const setProduct = mock(() => {});
		const seeds = [
			{
				marketplaceId: "ATVPDKIKX0DER",
				asin: "B000000001",
				product: { title: "First" },
				syncPending: true,
			},
			{
				marketplaceId: "ATVPDKIKX0DER",
				asin: "B000000002",
				product: { title: "Second" },
				syncPending: false,
			},
		];

		seedCatalogProductQueries({
			seeds: seeds as Parameters<
				typeof seedCatalogProductQueries
			>[0]["seeds"],
			setProduct,
		});

		expect(setProduct.mock.calls).toEqual([[seeds[0]], [seeds[1]]]);
	});

	it("does not replace a completed SP-API read with an older pending seed", () => {
		const current = createProductRead({
			spApiFetchedAt: "2026-08-03T12:05:00.000Z",
			syncPending: false,
		});
		const seed = createProductRead({
			keepaFetchedAt: "2026-08-03T12:00:00.000Z",
			syncPending: true,
		});

		expect(selectFreshestProductRead(current, seed)).toBe(current);
	});

	it("uses a newer Catalog-run snapshot to refresh cached Keepa state", () => {
		const current = createProductRead({
			keepaFetchedAt: "2026-08-03T12:00:00.000Z",
			syncPending: false,
		});
		const seed = createProductRead({
			keepaFetchedAt: "2026-08-03T12:05:00.000Z",
			syncPending: false,
		});

		expect(selectFreshestProductRead(current, seed)).toBe(seed);
	});
});

const createProductRead = ({
	keepaFetchedAt = null,
	spApiFetchedAt = null,
	syncPending,
}: {
	keepaFetchedAt?: string | null;
	spApiFetchedAt?: string | null;
	syncPending: boolean;
}) =>
	({
		product: {
			metadata: { spApiFetchedAt },
			keepa: keepaFetchedAt ? { fetchedAt: keepaFetchedAt } : null,
		},
		syncPending,
	}) as Parameters<typeof selectFreshestProductRead>[1];
