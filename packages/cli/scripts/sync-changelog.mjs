import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(packageDir, '..', '..');
const sourcePath = path.join(repoRoot, 'CHANGELOG.md');
const destinationDir = path.join(packageDir, 'dist');
const destinationPath = path.join(destinationDir, 'CHANGELOG.md');

await mkdir(destinationDir, { recursive: true });
await copyFile(sourcePath, destinationPath);
