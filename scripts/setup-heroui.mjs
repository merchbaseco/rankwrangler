// Installs workspace dependencies and the licensed HeroUI React Pro dist.
//
// Two licensed registry credentials gate this step: the @hugeicons-pro scope
// 401s without its key, and the HeroUI Pro artifact download needs its token.
// Both are @internal schema items, so `varlock run` deliberately does not
// export them — they are fetched explicitly, under the install switch. A venue
// that already supplies them (CI secrets, the Docker build's secret mounts)
// short-circuits the lookup.
//
// `--skip-install` runs only the HeroUI Pro download, for venues that already
// ran `bun install` with their own flags (the website image build).
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasHeroUiArtifacts, heroUiPackageRoot } from './heroui-artifacts.mjs';

// Pinned so this resolves identically before node_modules exists.
const varlockSpec = 'varlock@1.16.1';

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const heroUiRoot = heroUiPackageRoot(repositoryRoot);
const skipInstall = process.argv.includes('--skip-install');

const main = () => {
    if (!skipInstall) {
        resolveInstallToken('MERCHBASE_GITHUB_NPM_TOKEN');
        resolveInstallToken('MERCHBASE_HUGEICONS_LICENSE_KEY');
    }
    // The HeroUI Pro installer reads its own literal name; the schema owns the
    // canonical one.
    process.env.HEROUI_AUTH_TOKEN ||= resolveInstallToken('HEROUI_PRO_CICD_TOKEN');

    if (!skipInstall) {
        run('bun', ['install', '--frozen-lockfile'], repositoryRoot);
    }

    if (hasHeroUiArtifacts(heroUiRoot)) {
        console.log('HeroUI React Pro is ready.');
        return;
    }

    const postinstall = join(heroUiRoot, 'dist/postinstall/index.js');
    if (!existsSync(postinstall)) {
        fail(
            'HeroUI React Pro bootstrap package is missing. Run `bun run setup` again after checking registry access.'
        );
    }

    console.log('Downloading the pinned HeroUI React Pro artifacts...');
    run(process.execPath, [postinstall], heroUiRoot);

    if (!hasHeroUiArtifacts(heroUiRoot)) {
        fail(
            'HeroUI React Pro authentication is required. HEROUI_PRO_CICD_TOKEN did not resolve; check 1Password access and try again.'
        );
    }

    // A dev server started before this download caches a broken resolution for
    // @heroui-pro/react, and that cache outlives a restart. Drop it with the fix.
    rmSync(join(repositoryRoot, 'apps/website/node_modules/.vite'), {
        force: true,
        recursive: true,
    });

    console.log('HeroUI React Pro is ready.');
};

const resolveInstallToken = name => {
    const existing = process.env[name]?.trim();
    if (existing) {
        return existing;
    }

    const result = spawnSync('bunx', [varlockSpec, 'printenv', name], {
        cwd: repositoryRoot,
        encoding: 'utf8',
        env: { ...process.env, RANKWRANGLER_RESOLVE_INSTALL_TOKENS: 'true' },
    });
    const value = result.status === 0 ? result.stdout.trim() : '';
    if (value) {
        process.env[name] = value;
        return value;
    }

    console.warn(
        `[setup] ${name} did not resolve from .env.schema; licensed installs may fail. Check 1Password access.`
    );
    return '';
};

const run = (command, args, cwd) => {
    const result = spawnSync(command, args, { cwd, env: process.env, stdio: 'inherit' });
    if (result.error) {
        fail(result.error.message);
    }
    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
};

const fail = message => {
    console.error(message);
    process.exit(1);
};

main();
