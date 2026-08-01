import { spawnSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import {
    MERCHBASE_API_KEY_ENV,
    MERCHBASE_API_KEY_KEYCHAIN_ACCOUNT,
    MERCHBASE_API_KEY_KEYCHAIN_SERVICE,
} from '@merchbaseco/access';
import { CliAuthError } from './cli-auth-error';

export const API_KEY_ENV_VAR = MERCHBASE_API_KEY_ENV;
export const AUTH_SERVICE_NAME = MERCHBASE_API_KEY_KEYCHAIN_SERVICE;
export const AUTH_ACCOUNT_NAME = MERCHBASE_API_KEY_KEYCHAIN_ACCOUNT;

const INTERNAL_SECRET_STORE_DIR_ENV_VAR = 'RW_INTERNAL_CLI_SECRET_STORE_DIR';

type CliFail = (code: string, message: string, details?: unknown) => never;

type AuthCommand = {
    verb: string;
    args: string[];
};

type AuthCommandOptions = {
    stdin?: boolean;
};

type CliSecureStore = {
    accountName: string;
    backend: string;
    clear: () => Promise<boolean>;
    get: () => Promise<string | null>;
    serviceName: string;
    set: (value: string) => Promise<void>;
};

type KeytarModule = {
    deletePassword: (service: string, account: string) => Promise<boolean>;
    getPassword: (service: string, account: string) => Promise<string | null>;
    setPassword: (service: string, account: string, password: string) => Promise<void>;
};

export const resolveApiKey = async () => {
    const envApiKey = resolveEnvApiKey();
    if (envApiKey) {
        return envApiKey;
    }

    const secureStore = await createSecureStore();
    return (await secureStore.get()) ?? undefined;
};

export const runAuthCommand = async (
    command: AuthCommand,
    fail: CliFail,
    options: AuthCommandOptions = {}
) => {
    if (command.verb === 'status') {
        return buildAuthStatus();
    }

    if (command.verb === 'set') {
        const value = await resolveAuthSetValue(command.args, fail, options);
        const secureStore = await createSecureStore();

        await secureStore.set(value);

        return {
            ...(await buildAuthStatus()),
            saved: true,
        };
    }

    if (command.verb === 'clear') {
        const secureStore = await createSecureStore();
        const cleared = await secureStore.clear();

        return {
            ...(await buildAuthStatus()),
            cleared,
        };
    }

    fail('UNKNOWN_COMMAND', 'Unknown auth command', { verb: command.verb });
};

export const buildAuthStatus = async () => {
    const envApiKey = resolveEnvApiKey();

    try {
        const secureStore = await createSecureStore();
        const storedApiKey = await secureStore.get();

        return {
            source: envApiKey ? 'env' : storedApiKey ? 'secure-store' : 'none',
            envOverride: Boolean(envApiKey),
            secureStore: {
                backend: secureStore.backend,
                serviceName: secureStore.serviceName,
                accountName: secureStore.accountName,
                available: true,
                hasStoredApiKey: Boolean(storedApiKey),
            },
        };
    } catch (error) {
        return {
            source: envApiKey ? 'env' : 'none',
            envOverride: Boolean(envApiKey),
            secureStore: {
                backend: getSecureStoreBackendLabel(),
                serviceName: AUTH_SERVICE_NAME,
                accountName: AUTH_ACCOUNT_NAME,
                available: false,
                hasStoredApiKey: null,
                error: error instanceof Error ? error.message : 'Unknown secure-store error',
            },
        };
    }
};

const resolveAuthSetValue = async (
    args: string[],
    fail: CliFail,
    options: AuthCommandOptions
) => {
    const positionalValue = args.join(' ').trim();
    if (positionalValue) {
        return positionalValue;
    }

    if (options.stdin) {
        const stdinValue = await readSecretFromStdin();
        if (stdinValue) {
            return stdinValue;
        }

        fail('INVALID_INPUT', 'auth set --stdin received an empty API key');
    }

    const envApiKey = resolveEnvApiKey();
    if (envApiKey) {
        return envApiKey;
    }

    if (process.stdin.isTTY && process.stderr.isTTY) {
        const promptValue = await readSecretFromPrompt('Merchbase API key: ');
        if (promptValue) {
            return promptValue;
        }

        fail('INVALID_INPUT', 'auth set received an empty API key');
    }

    fail(
        'INVALID_INPUT',
        `auth set requires <apiKey>, --stdin, or ${API_KEY_ENV_VAR}`
    );
};

const readSecretFromStdin = async () => {
    const chunks: Buffer[] = [];

    for await (const chunk of process.stdin) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    return Buffer.concat(chunks).toString('utf8').trim();
};

const readSecretFromPrompt = async (prompt: string) => {
    process.stderr.write(prompt);
    setTerminalEcho(false);

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stderr,
        terminal: true,
    });

    try {
        const value = await new Promise<string>(resolve => {
            rl.question('', resolve);
        });
        process.stderr.write('\n');
        return value.trim();
    } finally {
        rl.close();
        setTerminalEcho(true);
    }
};

const setTerminalEcho = (enabled: boolean) => {
    if (process.platform === 'win32' || !process.stdin.isTTY) {
        return;
    }

    spawnSync('stty', [enabled ? 'echo' : '-echo'], {
        stdio: ['inherit', 'ignore', 'ignore'],
    });
};

const resolveEnvApiKey = () => {
    const value = process.env[API_KEY_ENV_VAR]?.trim();
    return value ? value : undefined;
};

const createSecureStore = async (): Promise<CliSecureStore> => {
    const internalSecretStoreDir = process.env[INTERNAL_SECRET_STORE_DIR_ENV_VAR]?.trim();
    if (internalSecretStoreDir) {
        return createFileSecretStore(path.resolve(internalSecretStoreDir));
    }

    const keytar = await loadKeytar();

    return {
        backend: getSecureStoreBackendLabel(),
        serviceName: AUTH_SERVICE_NAME,
        accountName: AUTH_ACCOUNT_NAME,
        get: () => keytar.getPassword(AUTH_SERVICE_NAME, AUTH_ACCOUNT_NAME),
        set: value => keytar.setPassword(AUTH_SERVICE_NAME, AUTH_ACCOUNT_NAME, value),
        clear: () => keytar.deletePassword(AUTH_SERVICE_NAME, AUTH_ACCOUNT_NAME),
    };
};

const loadKeytar = async (): Promise<KeytarModule> => {
    try {
        const imported = (await import('keytar')) as KeytarModule & { default?: KeytarModule };
        return imported.default ?? imported;
    } catch (error) {
        throw new CliAuthError(
            'SECURE_STORE_UNAVAILABLE',
            'platform secure store is unavailable',
            error instanceof Error ? { cause: error.message } : undefined
        );
    }
};

const getSecureStoreBackendLabel = () => {
    switch (process.platform) {
        case 'darwin':
            return 'macos-keychain';
        case 'win32':
            return 'windows-credential-manager';
        default:
            return 'platform-secure-store';
    }
};

const createFileSecretStore = (secretStoreDir: string): CliSecureStore => {
    const secretPath = path.join(secretStoreDir, 'api-key.json');

    return {
        backend: 'test-file-store',
        serviceName: AUTH_SERVICE_NAME,
        accountName: AUTH_ACCOUNT_NAME,
        get: async () => {
            try {
                const raw = await readFile(secretPath, 'utf8');
                const parsed = JSON.parse(raw) as { apiKey?: unknown };

                return typeof parsed.apiKey === 'string' ? parsed.apiKey : null;
            } catch (error) {
                if (
                    error &&
                    typeof error === 'object' &&
                    'code' in error &&
                    (error as { code?: string }).code === 'ENOENT'
                ) {
                    return null;
                }

                throw new CliAuthError('INVALID_CONFIG', 'failed to read secure-store test data');
            }
        },
        set: async value => {
            await mkdir(secretStoreDir, { recursive: true });
            await writeFile(secretPath, `${JSON.stringify({ apiKey: value }, null, 2)}\n`, 'utf8');
        },
        clear: async () => {
            try {
                await rm(secretPath);
                return true;
            } catch (error) {
                if (
                    error &&
                    typeof error === 'object' &&
                    'code' in error &&
                    (error as { code?: string }).code === 'ENOENT'
                ) {
                    return false;
                }

                throw error;
            }
        },
    };
};
