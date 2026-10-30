import { expect, test } from "bun:test";
import {
	ACCESS_ISSUER,
	CHROME_EXTENSION_ID,
	CHROME_EXTENSION_PUBLIC_KEY,
	createChromeManifest,
	deriveChromeExtensionId,
	resolveChromeAuthBuildConfig,
} from "./chrome-extension-config";

test("keeps the permanent Chrome identity and pins Cloudflare sign-in", () => {
	expect(deriveChromeExtensionId(CHROME_EXTENSION_PUBLIC_KEY)).toBe(
		CHROME_EXTENSION_ID
	);
	const config = resolveChromeAuthBuildConfig({
		env: { VITE_MERCHBASE_ACCESS_ISSUER: ACCESS_ISSUER },
		requireProduction: true,
	});
	expect(config.issuer).toBe(ACCESS_ISSUER);
	expect(
		createChromeManifest({ manifest: {}, config, target: "chrome" }).key
	).toBe(CHROME_EXTENSION_PUBLIC_KEY);
	expect(
		createChromeManifest({ manifest: { key: "old" }, config, target: "safari" })
	).not.toHaveProperty("key");
});
test("refuses a different authority instead of delivering renewable credentials to it", () => {
	expect(() =>
		resolveChromeAuthBuildConfig({
			env: { VITE_MERCHBASE_ACCESS_ISSUER: "https://evil.example" },
			requireProduction: true,
		})
	).toThrow("configuration");
});
