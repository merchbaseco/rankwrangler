import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const NPM_TOKEN_ENV = 'RANKWRANGLER_NPM_PUBLISH_TOKEN';

// Publishing is the `release` resolution context: the token is an @internal
// schema item, so `varlock run` deliberately does not export it and it has to
// be fetched explicitly with `varlock printenv`. Resolution reaches the
// Tooling vault through 1Password desktop authorization, so an operator sees
// one approval prompt per release session. CI supplies the same name from its
// own secret store, which wins without touching 1Password at all.
export const resolveNpmToken = async ({
    env = process.env,
    execFileImpl = execFileAsync,
} = {}) => {
    const exported = env[NPM_TOKEN_ENV]?.trim();
    if (exported) {
        return { token: exported, source: 'env' };
    }

    let stdout;
    try {
        ({ stdout } = await execFileImpl(
            'bunx',
            ['varlock', 'printenv', NPM_TOKEN_ENV],
            {
                encoding: 'utf8',
                maxBuffer: 1024 * 1024,
                env: {
                    ...env,
                    RANKWRANGLER_RESOLVE_RELEASE_TOKENS: 'true',
                },
            }
        ));
    } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown error';
        throw new Error(
            `Could not resolve ${NPM_TOKEN_ENV} from 1Password via varlock: ${message}`
        );
    }

    const token = stdout.trim();
    if (!token) {
        throw new Error(
            `${NPM_TOKEN_ENV} resolved empty. Check op://Tooling/NPM Publish - RankWrangler.`
        );
    }

    return { token, source: 'varlock' };
};

const main = async () => {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.error(
            'usage: node scripts/release/with-npm-token.mjs <command> [args...]'
        );
        process.exit(1);
    }

    const resolved = await resolveNpmToken();
    const [command, ...commandArgs] = args;

    const child = spawn(command, commandArgs, {
        stdio: 'inherit',
        env: {
            ...process.env,
            [NPM_TOKEN_ENV]: resolved.token,
        },
    });

    child.on('error', error => {
        console.error(
            error instanceof Error ? error.message : 'failed to launch command'
        );
        process.exit(1);
    });

    child.on('exit', code => {
        process.exit(code ?? 1);
    });
};

if (process.argv[1]?.endsWith('with-npm-token.mjs')) {
    await main().catch(error => {
        console.error(error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
    });
}
