#!/usr/bin/env node

import { execSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Get the workspace root directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const workspaceRoot = join(__dirname, "..");

// Check if Xcode is properly set up
try {
	execSync("xcode-select -p", { stdio: "pipe" });
} catch (_error) {
	console.error("\n❌ Xcode not properly configured!");
	console.error("Please run these commands:");
	console.error("1. Install Xcode from the App Store if not already installed");
	console.error(
		"2. Run: sudo xcode-select -s /Applications/Xcode.app/Contents/Developer",
	);
	console.error("3. Run: sudo xcodebuild -license accept");
	process.exit(1);
}

console.log("🏗  Building RankWrangler...\n");

// Build the web extension
console.log("📦 Building web extension...");
execSync("bun run build", { stdio: "inherit", cwd: workspaceRoot });

const RESOURCES_DIR = join(
	workspaceRoot,
	"safari-extension/Shared (Extension)/Resources",
);
const EXTENSION_DIST = join(workspaceRoot, "dist");

console.log("\n📋 Copying extension to Safari...");
rmSync(RESOURCES_DIR, { recursive: true, force: true });
mkdirSync(RESOURCES_DIR, { recursive: true });

// Copy the extension files (includes icons)
console.log("📦 Copying extension files...");
cpSync(EXTENSION_DIST, RESOURCES_DIR, { recursive: true });

console.log("\n🧹 Cleaning previous Safari build artifacts...");
try {
	execSync(
		'xcodebuild -project rankwrangler.xcodeproj -scheme "rankwrangler (macOS)" clean',
		{
			stdio: "inherit",
			cwd: join(workspaceRoot, "safari-extension"),
		},
	);
} catch (_error) {
	console.warn(
		"⚠️  Clean step failed – continuing with build. Consider cleaning manually in Xcode if issues persist.",
	);
}

console.log("\n🚀 Building Safari app...");
try {
	execSync(
		'xcodebuild -project rankwrangler.xcodeproj -scheme "rankwrangler (macOS)" build',
		{
			stdio: "inherit",
			cwd: join(workspaceRoot, "safari-extension"),
		},
	);
} catch (_error) {
	console.error("\n❌ Failed to build Safari app!");
	console.error("Make sure Xcode is properly configured:");
	console.error("1. Open Xcode and accept the license agreement");
	console.error(
		"2. Run: sudo xcode-select -s /Applications/Xcode.app/Contents/Developer",
	);
	process.exit(1);
}

console.log("\n✅ Safari build complete!\n");
console.log("To test in Safari:");
console.log("1. Open Safari");
console.log(
	"2. Enable Developer menu: Safari > Settings > Advanced > 'Show Develop menu in menu bar'",
);
console.log(
	"3. Enable unsigned extensions: Develop > Allow Unsigned Extensions",
);
console.log("4. Open Safari Settings > Extensions and enable RankWrangler");
