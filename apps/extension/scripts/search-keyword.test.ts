import { describe, it, expect } from "bun:test";
import { readAmazonSearchKeyword } from "../src/scripts/content/utils/search-keyword";
describe("Amazon extension keyword context", () => {
	it("captures real US keyword searches without treating product pages or other domains as searches", () => {
		expect(
			readAmazonSearchKeyword("https://www.amazon.com/s?k=mele+kalikimaka")
		).toBe("mele kalikimaka");
		expect(
			readAmazonSearchKeyword("https://amazon.com/s/ref=nb_sb_noss?k=RN")
		).toBe("RN");
		expect(
			readAmazonSearchKeyword("https://www.amazon.com/dp/B07ZSKYWL2?k=shirt")
		).toBeNull();
		expect(
			readAmazonSearchKeyword("https://notamazon.com/s?k=shirt")
		).toBeNull();
		expect(
			readAmazonSearchKeyword("https://amazon.co.uk/s?k=shirt")
		).toBeNull();
		expect(readAmazonSearchKeyword("https://amazon.com/s?k=")).toBeNull();
	});
});
