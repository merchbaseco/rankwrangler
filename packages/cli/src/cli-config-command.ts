import { buildAuthStatus } from './cli-auth';
import {
    resetConfig,
    saveConfig,
    switchStorageDir,
    unsetStorageDir,
    type CliConfig,
    type CliPaths,
} from './cli-config';
import { normalizeBaseUrl } from './cli-options';

type CliFail = (code: string, message: string, details?: unknown) => never;

type ConfigCommand = {
    verb: string;
    args: string[];
};

const CONFIG_KEYS = ['base-url', 'marketplace', 'storage-dir'] as const;

type ConfigKey = (typeof CONFIG_KEYS)[number];

export const runConfigCommand = async (
    command: ConfigCommand,
    config: CliConfig,
    paths: CliPaths,
    fail: CliFail
) => {
    if (command.verb === 'show') {
        return buildConfigResponse(paths, config);
    }

    if (command.verb === 'get') {
        const key = requireConfigKey(command.args[0], 'config get', fail);

        return {
            key,
            value: getConfigValue(key, paths, config),
        };
    }

    if (command.verb === 'unset') {
        const key = requireConfigKey(command.args[0], 'config unset', fail);
        const nextState = await unsetConfigValue(key, paths, config);

        return {
            ...(await buildConfigResponse(nextState.paths, nextState.config)),
            unset: key,
        };
    }

    if (command.verb === 'reset') {
        const nextState = await resetConfig(paths);

        return {
            ...(await buildConfigResponse(nextState.paths, nextState.config)),
            reset: true,
        };
    }

    if (command.verb !== 'set') {
        fail('UNKNOWN_COMMAND', 'Unknown config command', { verb: command.verb });
    }

    const [key, ...valueParts] = command.args;
    if (!key || valueParts.length === 0) {
        fail('INVALID_INPUT', 'config set requires <key> <value>');
    }

    const value = valueParts.join(' ').trim();
    if (!value) {
        fail('INVALID_INPUT', 'config set value cannot be empty');
    }

    if (key === 'storage-dir') {
        const nextState = await switchStorageDir({
            currentConfig: config,
            currentPaths: paths,
            requestedStorageDir: value,
        });

        return buildConfigResponse(nextState.paths, nextState.config);
    }

    const nextConfig = { ...config };

    if (key === 'base-url') {
        nextConfig.baseUrl = normalizeBaseUrl(value, fail);
    } else if (key === 'marketplace') {
        nextConfig.marketplaceId = value;
    } else {
        failUnsupportedConfigKey(key, fail);
    }

    await saveConfig(paths, nextConfig);

    return buildConfigResponse(paths, nextConfig);
};

const buildConfigResponse = async (paths: CliPaths, config: CliConfig) => {
    return {
        storageDir: paths.storageDir,
        path: paths.configPath,
        globalPath: paths.globalConfigPath,
        config,
        auth: await buildAuthStatus(),
    };
};

const requireConfigKey = (
    key: string | undefined,
    commandName: string,
    fail: CliFail
): ConfigKey => {
    if (!key) {
        fail('INVALID_INPUT', `${commandName} requires <key>`, {
            supportedKeys: CONFIG_KEYS,
        });
    }

    if (isConfigKey(key)) {
        return key;
    }

    return failUnsupportedConfigKey(key, fail);
};

const isConfigKey = (key: string): key is ConfigKey => {
    return CONFIG_KEYS.includes(key as ConfigKey);
};

const getConfigValue = (key: ConfigKey, paths: CliPaths, config: CliConfig) => {
    switch (key) {
        case 'base-url':
            return config.baseUrl ?? null;
        case 'marketplace':
            return config.marketplaceId ?? null;
        case 'storage-dir':
            return paths.storageDir;
    }
};

const unsetConfigValue = async (key: ConfigKey, paths: CliPaths, config: CliConfig) => {
    if (key === 'storage-dir') {
        return unsetStorageDir(paths);
    }

    const nextConfig = { ...config };

    if (key === 'base-url') {
        nextConfig.baseUrl = undefined;
    } else {
        nextConfig.marketplaceId = undefined;
    }

    await saveConfig(paths, nextConfig);

    return {
        paths,
        config: nextConfig,
    };
};

const failUnsupportedConfigKey = (key: string, fail: CliFail): never => {
    fail('INVALID_INPUT', 'unsupported config key', {
        key,
        supportedKeys: CONFIG_KEYS,
    });
};
