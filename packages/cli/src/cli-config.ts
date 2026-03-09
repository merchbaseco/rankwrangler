import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

export type CliConfig = {
    baseUrl?: string;
    marketplaceId?: string;
};

export type CliPaths = {
    defaultStorageDir: string;
    storageDir: string;
    configPath: string;
    globalConfigPath: string;
};

type CliGlobalConfig = {
    storageDir?: string;
};

const DEFAULT_STORAGE_DIR = path.join(homedir(), '.rankwrangler');
const CONFIG_FILENAME = 'config.json';
const GLOBAL_CONFIG_FILENAME = 'global.json';

export class CliStorageError extends Error {
    readonly code: string;
    readonly details?: unknown;

    constructor(code: string, message: string, details?: unknown) {
        super(message);
        this.name = 'CliStorageError';
        this.code = code;
        this.details = details;
    }
}

export const getDefaultCliPaths = (): CliPaths => {
    return buildCliPaths(DEFAULT_STORAGE_DIR);
};

export const loadCliContext = async () => {
    const paths = await resolveCliPaths();
    const config = await loadConfig(paths.configPath);

    return {
        paths,
        config,
    };
};

export const loadCliPathsOrDefault = async () => {
    try {
        return await resolveCliPaths();
    } catch {
        return getDefaultCliPaths();
    }
};

export const clearConfig = async (paths: CliPaths) => {
    await rm(paths.configPath, { force: true });
};

export const saveConfig = async (paths: CliPaths, config: CliConfig) => {
    await mkdir(paths.storageDir, { recursive: true });
    await writeFile(paths.configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
};

export const switchStorageDir = async ({
    currentConfig,
    currentPaths,
    requestedStorageDir,
}: {
    currentConfig: CliConfig;
    currentPaths: CliPaths;
    requestedStorageDir: string;
}) => {
    const storageDir = normalizeStorageDir(requestedStorageDir);
    const nextPaths = buildCliPaths(storageDir);
    const targetConfig = await loadConfig(nextPaths.configPath);
    const nextConfig = mergeConfigs(currentConfig, targetConfig);

    await saveConfig(nextPaths, nextConfig);
    await saveGlobalConfig(currentPaths.globalConfigPath, {
        storageDir: storageDir === currentPaths.defaultStorageDir ? undefined : storageDir,
    });

    return {
        paths: nextPaths,
        config: nextConfig,
    };
};

const resolveCliPaths = async () => {
    const defaults = getDefaultCliPaths();
    const globalConfig = await loadGlobalConfig(defaults.globalConfigPath);
    const storageDir = normalizeStorageDir(globalConfig.storageDir ?? defaults.storageDir);

    return buildCliPaths(storageDir);
};

const buildCliPaths = (storageDir: string): CliPaths => {
    return {
        defaultStorageDir: DEFAULT_STORAGE_DIR,
        storageDir,
        configPath: path.join(storageDir, CONFIG_FILENAME),
        globalConfigPath: path.join(DEFAULT_STORAGE_DIR, GLOBAL_CONFIG_FILENAME),
    };
};

const loadConfig = async (configPath: string): Promise<CliConfig> => {
    const parsed = await readJsonFile(configPath, 'failed to read config');

    if (!parsed) {
        return {};
    }

    return {
        baseUrl: typeof parsed.baseUrl === 'string' ? parsed.baseUrl : undefined,
        marketplaceId:
            typeof parsed.marketplaceId === 'string' ? parsed.marketplaceId : undefined,
    };
};

const loadGlobalConfig = async (globalConfigPath: string): Promise<CliGlobalConfig> => {
    const parsed = await readJsonFile(globalConfigPath, 'failed to read global config');

    if (!parsed) {
        return {};
    }

    return {
        storageDir: typeof parsed.storageDir === 'string' ? parsed.storageDir : undefined,
    };
};

const saveGlobalConfig = async (globalConfigPath: string, config: CliGlobalConfig) => {
    if (!config.storageDir) {
        await rm(globalConfigPath, { force: true });
        return;
    }

    await mkdir(path.dirname(globalConfigPath), { recursive: true });
    await writeFile(globalConfigPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
};

const readJsonFile = async (
    filePath: string,
    errorMessage: string
): Promise<Record<string, unknown> | null> => {
    try {
        const raw = await readFile(filePath, 'utf8');
        return JSON.parse(raw) as Record<string, unknown>;
    } catch (error) {
        if (
            error &&
            typeof error === 'object' &&
            'code' in error &&
            (error as { code?: string }).code === 'ENOENT'
        ) {
            return null;
        }

        throw new CliStorageError('INVALID_CONFIG', errorMessage, { path: filePath });
    }
};

const normalizeStorageDir = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
        throw new CliStorageError('INVALID_INPUT', 'storage dir cannot be empty');
    }

    const expanded = expandHomeDirectory(trimmed);

    return path.resolve(expanded);
};

const expandHomeDirectory = (value: string) => {
    if (value === '~') {
        return homedir();
    }

    if (value.startsWith('~/')) {
        return path.join(homedir(), value.slice(2));
    }

    return value;
};

const mergeConfigs = (currentConfig: CliConfig, targetConfig: CliConfig): CliConfig => {
    return {
        baseUrl: targetConfig.baseUrl ?? currentConfig.baseUrl,
        marketplaceId: targetConfig.marketplaceId ?? currentConfig.marketplaceId,
    };
};
