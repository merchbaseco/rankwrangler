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
				amazonListingStatus: "pending",
			},
			{
				marketplaceId: "ATVPDKIKX0DER",
				asin: "B000000002",
				product: { title: "Second" },
				amazonListingStatus: "active",
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

	it("does not replace a completed Product read with an older pending seed", () => {
		const current = createProductRead({
			updatedAt: "2026-08-03T12:05:00.000Z",
			amazonListingStatus: "active",
		});
		const seed = createProductRead({
			keepaFetchedAt: "2026-08-03T12:00:00.000Z",
			amazonListingStatus: "pending",
		});

		expect(selectFreshestProductRead(current, seed)).toBe(current);
	});

	it("uses a newer Catalog-run snapshot to refresh cached Keepa state", () => {
		const current = createProductRead({
			keepaFetchedAt: "2026-08-03T12:00:00.000Z",
			amazonListingStatus: "active",
		});
		const seed = createProductRead({
			keepaFetchedAt: "2026-08-03T12:05:00.000Z",
			amazonListingStatus: "active",
		});

		expect(selectFreshestProductRead(current, seed)).toBe(seed);
	});
});

const createProductRead = ({
	keepaFetchedAt = null,
	updatedAt = null,
	availability,
}: {
	keepaFetchedAt?: string | null;
	updatedAt?: string | null;
	amazonListingStatus: "pending" | "active" | "deleted";
}) =>
	({
	product: {
			freshness: { stale: false, updatedAt },
			keepa: keepaFetchedAt ? { fetchedAt: keepaFetchedAt } : null,
		},
		availability,
	}) as Parameters<typeof selectFreshestProductRead>[1];
