#!/usr/bin/env node

import { mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Extension icon sizes needed
const EXTENSION_ICON_SIZES = {
    'icon16.png': 16,
    'icon32.png': 32,
    'icon48.png': 48,
    'icon128.png': 128,
};

// Safari app icon sizes needed
const APP_ICON_SIZES = {
    'icon_16.png': 16,
    'icon_32.png': 32,
    'icon_64.png': 64,
    'icon_128.png': 128,
    'icon_256.png': 256,
    'icon_512.png': 512,
    'icon_1024.png': 1024,
};

async function generateExtensionIcons() {
    console.log('\n🎨 Generating extension icons...');
    const sourceIcon = join(rootDir, 'src/icon.svg');
    const distDir = join(rootDir, 'dist/images');

    try {
        // Ensure the directory exists
        mkdirSync(distDir, { recursive: true });

        // Generate each size
        await Promise.all(
            Object.entries(EXTENSION_ICON_SIZES).map(async ([filename, size]) => {
                await sharp(sourceIcon).resize(size, size).toFile(join(distDir, filename));
            })
        );

        console.log('✅ Extension icons generated successfully');
    } catch (error) {
        console.error('❌ Error generating extension icons:', error);
        process.exit(1);
    }
}

async function generateSafariAppIcons() {
    console.log('\n🎨 Generating Safari app icons...');
    const sourceIcon = join(rootDir, 'src/icon.svg');
    const safariIconsDir = join(
        rootDir,
        '../../safari-app/Shared (App)/Assets.xcassets/AppIcon.appiconset'
    );

    try {
        // Ensure the directory exists
        mkdirSync(safariIconsDir, { recursive: true });

        // Generate each size
        await Promise.all(
            Object.entries(APP_ICON_SIZES).map(async ([filename, size]) => {
                await sharp(sourceIcon).resize(size, size).toFile(join(safariIconsDir, filename));
            })
        );

        // Generate Contents.json
        const contents = {
            images: Object.entries(APP_ICON_SIZES).map(([filename, size]) => ({
                filename: filename,
                idiom: 'universal',
                platform: 'ios',
                size: `${size}x${size}`,
                scale: '1x',
            })),
            info: {
                author: 'xcode',
                version: 1,
            },
        };

        // Write Contents.json
        await writeFile(join(safariIconsDir, 'Contents.json'), JSON.stringify(contents, null, 2));

        console.log('✅ Safari app icons generated successfully');
    } catch (error) {
        console.error('❌ Error generating Safari app icons:', error);
        process.exit(1);
    }
}

// Generate all icons
async function generateAllIcons() {
    await generateExtensionIcons();
    await generateSafariAppIcons();
}

generateAllIcons();
