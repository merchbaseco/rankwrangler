#!/usr/bin/env node

import { execSync } from 'child_process';
import { rmSync, cpSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Get the workspace root directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const workspaceRoot = join(__dirname, '..');

// Check if Xcode is properly set up
try {
    execSync('xcode-select -p', { stdio: 'pipe' });
} catch (error) {
    console.error('\n❌ Xcode not properly configured!');
    console.error('Please run these commands:');
    console.error('1. Install Xcode from the App Store if not already installed');
    console.error('2. Run: sudo xcode-select -s /Applications/Xcode.app/Contents/Developer');
    console.error('3. Run: sudo xcodebuild -license accept');
    process.exit(1);
}

console.log('🏗  Building RankWrangler...\n');

// Build the web extension using turbo (this will also build icons)
console.log('📦 Building web extension...');
execSync('turbo run build --filter=@rankwrangler/extension', { stdio: 'inherit' });

const RESOURCES_DIR = join(workspaceRoot, 'safari-app/Shared (Extension)/Resources');
const EXTENSION_DIST = join(workspaceRoot, 'extension/dist');
const ICONS_DIST = join(workspaceRoot, 'packages/icons/dist');

console.log('\n📋 Copying extension to Safari...');
rmSync(RESOURCES_DIR, { recursive: true, force: true });
mkdirSync(RESOURCES_DIR, { recursive: true });

// First copy the icons
console.log('🎨 Copying icons...');
cpSync(join(ICONS_DIST, 'images'), join(RESOURCES_DIR, 'images'), { recursive: true });

// Then copy the extension files
console.log('📦 Copying extension files...');
cpSync(EXTENSION_DIST, RESOURCES_DIR, { recursive: true });

console.log('\n🚀 Building Safari app...');
try {
    execSync('xcodebuild -project rankwrangler.xcodeproj -scheme "rankwrangler (macOS)" build', {
        stdio: 'inherit',
        cwd: join(workspaceRoot, 'safari-app'),
    });
} catch (error) {
    console.error('\n❌ Failed to build Safari app!');
    console.error('Make sure Xcode is properly configured:');
    console.error('1. Open Xcode and accept the license agreement');
    console.error('2. Run: sudo xcode-select -s /Applications/Xcode.app/Contents/Developer');
    process.exit(1);
}

console.log('\n✅ Safari build complete!\n');
console.log('To test in Safari:');
console.log('1. Open Safari');
console.log(
    "2. Enable Developer menu: Safari > Settings > Advanced > 'Show Develop menu in menu bar'"
);
console.log('3. Enable unsigned extensions: Develop > Allow Unsigned Extensions');
console.log('4. Open Safari Settings > Extensions and enable RankWrangler');
