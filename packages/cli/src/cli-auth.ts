import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const LICENSE_KEY_ENV_VAR = 'RR_LICENSE_KEY';
export const AUTH_SERVICE_NAME = 'RankWrangler CLI';
export const AUTH_ACCOUNT_NAME = 'license-key';

const INTERNAL_SECRET_STORE_DIR_ENV_VAR = 'RW_INTERNAL_CLI_SECRET_STORE_DIR';

type CliFail = (code: string, message: string, details?: unknown) => never;

type AuthCommand = {
    verb: string;
    args: string[];
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

export class CliAuthError extends Error {
    readonly code: string;
    readonly details?: unknown;

    constructor(code: string, message: string, details?: unknown) {
        super(message);
        this.name = 'CliAuthError';
        this.code = code;
        this.details = details;
    }
}

export const resolveApiKey = async () => {
    const envLicenseKey = resolveEnvLicenseKey();
    if (envLicenseKey) {
        return envLicenseKey;
    }

    const secureStore = await createSecureStore();
    return (await secureStore.get()) ?? undefined;
};

export const runAuthCommand = async (command: AuthCommand, fail: CliFail) => {
    if (command.verb === 'status') {
        return buildAuthStatus();
    }

    if (command.verb === 'set') {
        const value = resolveAuthSetValue(command.args, fail);
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

const buildAuthStatus = async () => {
    const envLicenseKey = resolveEnvLicenseKey();

    try {
        const secureStore = await createSecureStore();
        const storedLicenseKey = await secureStore.get();

        return {
            source: envLicenseKey ? 'env' : storedLicenseKey ? 'secure-store' : 'none',
            envOverride: Boolean(envLicenseKey),
            secureStore: {
                backend: secureStore.backend,
                serviceName: secureStore.serviceName,
                accountName: secureStore.accountName,
                available: true,
                hasStoredLicenseKey: Boolean(storedLicenseKey),
            },
        };
    } catch (error) {
        return {
            source: envLicenseKey ? 'env' : 'none',
            envOverride: Boolean(envLicenseKey),
            secureStore: {
                backend: getSecureStoreBackendLabel(),
                serviceName: AUTH_SERVICE_NAME,
                accountName: AUTH_ACCOUNT_NAME,
                available: false,
                hasStoredLicenseKey: null,
                error: error instanceof Error ? error.message : 'Unknown secure-store error',
            },
        };
    }
};

const resolveAuthSetValue = (args: string[], fail: CliFail) => {
    const positionalValue = args.join(' ').trim();
    if (positionalValue) {
        return positionalValue;
    }

    const envLicenseKey = resolveEnvLicenseKey();
    if (envLicenseKey) {
        return envLicenseKey;
    }

    fail('INVALID_INPUT', `auth set requires <licenseKey> or ${LICENSE_KEY_ENV_VAR}`);
};

const resolveEnvLicenseKey = () => {
    const value = process.env[LICENSE_KEY_ENV_VAR]?.trim();
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
    const secretPath = path.join(secretStoreDir, 'license-key.json');

    return {
        backend: 'test-file-store',
        serviceName: AUTH_SERVICE_NAME,
        accountName: AUTH_ACCOUNT_NAME,
        get: async () => {
            try {
                const raw = await readFile(secretPath, 'utf8');
                const parsed = JSON.parse(raw) as { licenseKey?: unknown };

                return typeof parsed.licenseKey === 'string' ? parsed.licenseKey : null;
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
            await writeFile(secretPath, `${JSON.stringify({ licenseKey: value }, null, 2)}\n`, 'utf8');
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
