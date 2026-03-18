import { clearConfig, saveConfig, switchStorageDir, type CliConfig, type CliPaths } from './cli-config';
import { normalizeBaseUrl } from './cli-options';

type CliFail = (code: string, message: string, details?: unknown) => never;

type ConfigCommand = {
    verb: string;
    args: string[];
};

export const runConfigCommand = async (
    command: ConfigCommand,
    config: CliConfig,
    paths: CliPaths,
    fail: CliFail
) => {
    if (command.verb === 'show') {
        return buildConfigResponse(paths, config);
    }

    if (command.verb === 'clear') {
        await clearConfig(paths);
        return {
            ...buildConfigResponse(paths, {}),
            cleared: true,
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
        fail('INVALID_INPUT', 'unsupported config key', {
            key,
            supportedKeys: ['base-url', 'marketplace', 'storage-dir'],
        });
    }

    await saveConfig(paths, nextConfig);

    return buildConfigResponse(paths, nextConfig);
};

const buildConfigResponse = (paths: CliPaths, config: CliConfig) => {
    return {
        storageDir: paths.storageDir,
        path: paths.configPath,
        globalPath: paths.globalConfigPath,
        config,
    };
};
