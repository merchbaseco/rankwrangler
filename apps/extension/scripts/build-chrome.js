#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Get the workspace root directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const workspaceRoot = resolve(__dirname, "..");
const buildEnvironment = {
	...process.env,
	CHROME_RELEASE_BUILD: "1",
	NODE_ENV: "production",
	VITE_RANKWRANGLER_EXTENSION_AUTH_MODE: "chrome",
};

console.log("🏗  Building RankWrangler for Chrome (production)...\n");

console.log("🔒 Checking production auth configuration...");
execFileSync("bun", ["run", "validate:chrome"], {
	stdio: "inherit",
	cwd: workspaceRoot,
	env: buildEnvironment,
});

// Build the web extension
console.log("📦 Building web extension...");
execFileSync("bun", ["run", "build", "--mode", "production"], {
	stdio: "inherit",
	cwd: workspaceRoot,
	env: buildEnvironment,
});

console.log("\n✅ Chrome build complete!\n");
console.log("Chrome extension ready in: dist/");
console.log("\nTo test in Chrome:");
console.log("1. Open Chrome and navigate to chrome://extensions");
console.log('2. Enable "Developer mode" (toggle in top right)');
console.log('3. Click "Load unpacked"');
console.log("4. Select the dist/ directory");
