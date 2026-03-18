import { execFile, spawn } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const scriptPath = fileURLToPath(import.meta.url);

export const DEFAULT_NPM_KEYCHAIN_SERVICE = 'rankwrangler-npm-token';

export const resolveNpmToken = async ({
    env = process.env,
    platform = process.platform,
    execFileImpl = execFileAsync,
} = {}) => {
    const envToken = env.NPM_TOKEN?.trim();
    if (envToken) {
        return {
            token: envToken,
            source: 'env',
        };
    }

    if (platform !== 'darwin') {
        throw new Error(
            'NPM_TOKEN is required in the environment on non-macOS hosts. Use your CI secret store.'
        );
    }

    const account = resolveKeychainAccount(env);
    const service = env.RANKWRANGLER_NPM_KEYCHAIN_SERVICE?.trim() || DEFAULT_NPM_KEYCHAIN_SERVICE;

    try {
        const { stdout } = await execFileImpl(
            'security',
            ['find-generic-password', '-a', account, '-s', service, '-w'],
            {
                encoding: 'utf8',
                maxBuffer: 1024 * 1024,
            }
        );

        const token = stdout.trim();
        if (!token) {
            throw new Error('macOS Keychain returned an empty token');
        }

        return {
            token,
            source: 'keychain',
            account,
            service,
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown keychain error';
        throw new Error(
            `Could not load NPM_TOKEN from macOS Keychain item ${service}/${account}: ${message}`
        );
    }
};

const main = async () => {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.error('usage: node scripts/release/with-npm-token.mjs <command> [args...]');
        process.exit(1);
    }

    const resolved = await resolveNpmToken();
    const [command, ...commandArgs] = args;

    const child = spawn(command, commandArgs, {
        stdio: 'inherit',
        env: {
            ...process.env,
            NPM_TOKEN: resolved.token,
        },
    });

    child.on('error', error => {
        console.error(error instanceof Error ? error.message : 'failed to launch command');
        process.exit(1);
    });

    child.on('exit', code => {
        process.exit(code ?? 1);
    });
};

const resolveKeychainAccount = env => {
    const account =
        env.RANKWRANGLER_NPM_KEYCHAIN_ACCOUNT?.trim() || env.USER?.trim() || env.LOGNAME?.trim();

    if (!account) {
        throw new Error(
            'Could not resolve the macOS Keychain account. Set USER or RANKWRANGLER_NPM_KEYCHAIN_ACCOUNT.'
        );
    }

    return account;
};

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
    await main().catch(error => {
        console.error(error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
    });
}
