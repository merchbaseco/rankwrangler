import { describe, expect, it } from "bun:test";
import { withTimeDomainLabel } from "./metrics-time-domain-label";

describe("withTimeDomainLabel", () => {
	it("returns the base label when no time domain is provided", () => {
		expect(withTimeDomainLabel("Keepa Fetches", undefined)).toBe(
			"Keepa Fetches",
		);
	});

	it("returns the base label when the time domain is blank", () => {
		expect(withTimeDomainLabel("Keepa Fetches", "   ")).toBe("Keepa Fetches");
	});

	it("appends the time domain suffix when provided", () => {
		expect(withTimeDomainLabel("Keepa Fetches", "24hr")).toBe(
			"Keepa Fetches (24hr)",
		);
	});
});
