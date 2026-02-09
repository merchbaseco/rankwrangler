#!/usr/bin/env node

import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Get the workspace root directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const workspaceRoot = join(__dirname, "..");

console.log("🏗  Building RankWrangler for Chrome...\n");

// Build the web extension
console.log("📦 Building web extension...");
execSync("bun run build", { stdio: "inherit", cwd: workspaceRoot });

console.log("\n✅ Chrome build complete!\n");
console.log("Chrome extension ready in: dist/");
console.log("\nTo test in Chrome:");
console.log("1. Open Chrome and navigate to chrome://extensions");
console.log('2. Enable "Developer mode" (toggle in top right)');
console.log('3. Click "Load unpacked"');
console.log("4. Select the dist/ directory");
