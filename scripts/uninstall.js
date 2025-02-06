#!/usr/bin/env node

import { rm, readdir, readFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import { execSync } from 'child_process';

async function inspectExtensionResources(derivedDataPath) {
    if (!derivedDataPath) return;

    const appPath = join(derivedDataPath, 'rankwrangler.app');
    const extensionPath = join(appPath, 'Contents/PlugIns/rankwrangler Extension.appex');
    const resourcesPath = join(extensionPath, 'Contents/Resources');

    try {
        console.log('\n📂 Inspecting extension resources at:', resourcesPath);
        const files = await readdir(resourcesPath);
        console.log('Files found:', files);

        // Read and inspect manifest.json
        try {
            const manifestPath = join(resourcesPath, 'manifest.json');
            const manifestContent = await readFile(manifestPath, 'utf8');
            console.log('\n📄 manifest.json content:', manifestContent);
        } catch (error) {
            console.log('⚠️  Could not read manifest.json:', error.message);
        }
    } catch (error) {
        console.log('⚠️  Could not inspect resources:', error.message);
    }
}

async function findDerivedDataPath() {
    const derivedDataBase = join(homedir(), 'Library/Developer/Xcode/DerivedData');
    try {
        const entries = await readdir(derivedDataBase);
        const rankwranglerDir = entries.find(entry => entry.startsWith('rankwrangler-'));
        if (rankwranglerDir) {
            return join(derivedDataBase, rankwranglerDir, 'Build/Products/Debug');
        }
    } catch (error) {
        console.log('⚠️  Could not find DerivedData directory');
    }
    return null;
}

async function uninstall() {
    console.log('🗑  Uninstalling RankWrangler...');

    const derivedDataPath = await findDerivedDataPath();

    // Inspect resources before uninstalling
    await inspectExtensionResources(derivedDataPath);

    const paths = [
        '/Applications/rankwrangler.app',
        join(homedir(), 'Library/Containers/com.zknicker.rankwrangler'),
        join(homedir(), 'Library/Group Containers/com.zknicker.rankwrangler'),
    ];

    if (derivedDataPath) {
        paths.push(join(derivedDataPath, 'rankwrangler.app'));
        paths.push(join(derivedDataPath, 'rankwrangler.swiftmodule'));
    }

    for (const path of paths) {
        try {
            await rm(path, { recursive: true, force: true });
            console.log(`✅ Removed: ${path}`);
        } catch (error) {
            // Ignore errors about missing files/directories
            if (error.code !== 'ENOENT') {
                console.error(`❌ Error removing ${path}:`, error.message);
            } else {
                console.log(`⚠️  Not found: ${path}`);
            }
        }
    }

    // Try to kill any running instances
    try {
        execSync('killall "rankwrangler" 2>/dev/null || true');
        console.log('✅ Killed any running instances');
    } catch (error) {
        // Ignore errors if no processes were found
    }

    // Clean Xcode build state
    try {
        execSync(
            'xcodebuild clean -project rankwrangler.xcodeproj -scheme "rankwrangler (macOS)" -configuration Debug',
            {
                stdio: 'ignore',
            }
        );
        console.log('✅ Cleaned Xcode build state');
    } catch (error) {
        console.error('❌ Error cleaning Xcode build state');
    }

    console.log('🎉 Uninstall complete!');
}

uninstall().catch(console.error);
