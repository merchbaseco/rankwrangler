// HeroUI React Pro ships a bootstrap package; the real dist is downloaded by a
// postinstall step that bunfig.toml's `ignoreScripts` suppresses. The setup
// script runs that step explicitly, so setup and every build that needs the
// dist share one answer to "are the artifacts actually here?".
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export const HEROUI_PACKAGE_PATH = 'apps/website/node_modules/@heroui-pro/react';

const REQUIRED_ARTIFACTS = ['dist/index.d.ts', 'dist/index.js', 'dist/css/index.css'];

export const heroUiPackageRoot = repositoryRoot => join(repositoryRoot, HEROUI_PACKAGE_PATH);

export const hasHeroUiArtifacts = packageRoot =>
    REQUIRED_ARTIFACTS.every(artifact => existsSync(join(packageRoot, artifact)));
