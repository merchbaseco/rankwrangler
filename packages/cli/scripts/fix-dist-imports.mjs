#!/usr/bin/env node

import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, '..', 'dist');

function appendJsExtension(specifier) {
    if (specifier.endsWith('.js')) {
        return specifier;
    }

    return `${specifier}.js`;
}

const main = async () => {
    const entries = await readdir(distDir, { withFileTypes: true });

    await Promise.all(
        entries
            .filter(entry => entry.isFile() && entry.name.endsWith('.js'))
            .map(async entry => {
                const filePath = path.join(distDir, entry.name);
                const source = await readFile(filePath, 'utf8');
                const nextSource = source.replaceAll(
                    /from '(\.{1,2}\/[^']+)'/g,
                    (_, specifier) => `from '${appendJsExtension(specifier)}'`
                );

                if (nextSource !== source) {
                    await writeFile(filePath, nextSource, 'utf8');
                }
            })
    );
};

await main();
