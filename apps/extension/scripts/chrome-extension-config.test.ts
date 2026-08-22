import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import {
	CHROME_EXTENSION_ID,
	CHROME_EXTENSION_PUBLIC_KEY,
	CLERK_SYNC_HOST,
	createChromeManifest,
	deriveChromeExtensionId,
	resolveChromeAuthBuildConfig,
} from "./chrome-extension-config";

const productionEnvironment = {
	VITE_MERCHBASE_CLERK_ACCOUNT_URL: "https://merchbase.co/account",
	VITE_MERCHBASE_CLERK_PUBLISHABLE_KEY: "pk_live_ZXhhbXBsZS5jb20k",
	VITE_MERCHBASE_CLERK_SYNC_HOST: CLERK_SYNC_HOST,
};

describe("Chrome extension identity and release configuration", () => {
	it("derives the committed stable ID from the committed public key", () => {
		expect(deriveChromeExtensionId(CHROME_EXTENSION_PUBLIC_KEY)).toBe(
			CHROME_EXTENSION_ID
		);
	});

	it("requires live Clerk inputs while using the committed identity constants", () => {
		const config = resolveChromeAuthBuildConfig({
			env: productionEnvironment,
			requireProduction: true,
		});

		expect(config.accountUrl).toBe("https://merchbase.co/account");
		expect(config.publicKey).toBe(CHROME_EXTENSION_PUBLIC_KEY);
	});

	it("rejects the local development publishable key for Chrome release builds", () => {
		expect(() =>
			resolveChromeAuthBuildConfig({
				env: {
					...productionEnvironment,
					VITE_MERCHBASE_CLERK_PUBLISHABLE_KEY: "pk_test_local",
				},
				requireProduction: true,
			})
		).toThrow("pk_live_");
	});

	it("rejects malformed live-looking publishable keys", () => {
		expect(() =>
			resolveChromeAuthBuildConfig({
				env: {
					...productionEnvironment,
					VITE_MERCHBASE_CLERK_PUBLISHABLE_KEY: "pk_live_not-a-clerk-key",
				},
				requireProduction: true,
			})
		).toThrow("valid production Clerk publishable key");
	});

	it("ignores redundant identity environment values", () => {
		const config = resolveChromeAuthBuildConfig({
			env: {
				...productionEnvironment,
				VITE_CHROME_EXTENSION_ID: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
				VITE_CHROME_EXTENSION_PUBLIC_KEY: "changed-key",
			},
			requireProduction: true,
		});

		expect(config.extensionId).toBe(CHROME_EXTENSION_ID);
		expect(config.publicKey).toBe(CHROME_EXTENSION_PUBLIC_KEY);
	});

	it("keeps the same public key in the committed source manifest", () => {
		const manifest = JSON.parse(
			readFileSync(new URL("../manifest.json", import.meta.url), "utf8")
		) as { key?: string };

		expect(manifest.key).toBe(CHROME_EXTENSION_PUBLIC_KEY);
	});

	it("keeps the Chrome key out of Safari resources", () => {
		const config = resolveChromeAuthBuildConfig({
			env: productionEnvironment,
			requireProduction: true,
		});
		const sourceManifest = {
			name: "RankWrangler",
			key: CHROME_EXTENSION_PUBLIC_KEY,
		};

		expect(
			createChromeManifest({
				config,
				manifest: sourceManifest,
				target: "chrome",
			}).key
		).toBe(CHROME_EXTENSION_PUBLIC_KEY);
		expect(
			createChromeManifest({
				config,
				manifest: sourceManifest,
				target: "safari",
			}).key
		).toBeUndefined();
	});
});
