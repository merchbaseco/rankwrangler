import { readFileSync } from "node:fs";
import path from "node:path";
import { loadEnv } from "vite";
import {
	resolveChromeAuthBuildConfig,
	type ChromeBuildEnvironment,
} from "./chrome-extension-config";

const repoRoot = path.resolve(import.meta.dir, "../../..");
const env: ChromeBuildEnvironment = {
	...loadEnv("production", repoRoot, ""),
	...process.env,
};

const config = resolveChromeAuthBuildConfig({ env, requireProduction: true });
const sourceManifest = JSON.parse(
	readFileSync(path.resolve(import.meta.dir, "../manifest.json"), "utf8")
) as { key?: string };

if (sourceManifest.key !== config.publicKey) {
	throw new Error(
		"The committed Chrome manifest key does not match the permanent extension identity."
	);
}

console.log("Chrome production auth preflight passed.");
