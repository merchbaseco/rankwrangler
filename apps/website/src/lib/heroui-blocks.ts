import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import proBlocks from './heroui-pro-blocks.json';

const here = dirname(fileURLToPath(import.meta.url));

export const blocksIn = (dir: string) =>
    readdirSync(join(here, dir)).flatMap(name =>
        name.endsWith('.css') && name !== 'index.css' ? [name.slice(0, -4)] : []
    );

/**
 * HeroUI Pro's blocks, committed because the fast CI lane does not download the licensed Pro dist.
 * When the dist is installed, the theme contract test keeps this list in step with it.
 */
export const proBlocksDir = '../../node_modules/@heroui-pro/react/dist/css/components';
export const proBlocksInstalled = existsSync(join(here, proBlocksDir));

/** HeroUI and Pro blocks (from their stylesheet names), so `.tabs__indicator` reads as a part. */
export const herouiBlocks = [
    ...blocksIn('../../node_modules/@heroui/styles/dist/components'),
    ...proBlocks,
];
