#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { createRankWranglerClient, DEFAULT_API_BASE_URL } from '@rankwrangler/http-client';
import { printBundledChangelog, printCliVersion } from './cli-metadata';
import {
    clearConfig,
    loadCliContext,
    loadCliPathsOrDefault,
    saveConfig,
    switchStorageDir,
    type CliConfig,
    type CliPaths,
} from './cli-config';
import {
    normalizeBaseUrl,
    parseIntegerOption,
    requireAsins,
    requireMarketplaceId,
    requireSingleAsin,
    resolveApiKey,
    resolveBaseUrl,
    resolveHistoryMetrics,
    resolveHistoryWindow,
    type CliOptionValues,
} from './cli-options';
import { fail, printSuccess, resolveError } from './cli-output';
import { buildCliHistoryResponse, type AgentHistoryResponse } from './history-response';
import { printUsage } from './usage';

type CliCommand = {
    resource: string;
    verb: string;
    args: string[];
};

type CliMetaCommand = {
    name: 'changelog';
};

const SUPPORTED_COMMANDS = new Set([
    'products:get',
    'products:history',
    'license:status',
    'license:validate',
    'config:show',
    'config:clear',
    'config:set',
]);

const { positionals, values } = parseArgs({
    args: process.argv.slice(2),
    options: {
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean' },
        baseUrl: { type: 'string' },
        marketplace: { type: 'string', short: 'm' },
        asin: { type: 'string', multiple: true },
        metrics: { type: 'string' },
        startAt: { type: 'string' },
        endAt: { type: 'string' },
        days: { type: 'string' },
        limit: { type: 'string' },
    },
    allowPositionals: true,
});

const main = async () => {
    const optionValues = values as CliOptionValues;

    if (optionValues.version) {
        printCliVersion();
        return;
    }

    if (values.help || positionals.length === 0) {
        printUsage(await loadCliPathsOrDefault());
        process.exit(values.help ? 0 : 1);
    }

    const metaCommand = resolveMetaCommand(positionals);
    if (metaCommand) {
        if (metaCommand.name === 'changelog') {
            printBundledChangelog();
            return;
        }
    }

    const command = resolveCommandOrFail(positionals);
    if (!isSupportedCommand(command)) {
        fail('UNKNOWN_COMMAND', 'Unknown command', {
            command: `${command.resource} ${command.verb}`,
        });
    }

    const { config, paths } = await loadCliContext();

    if (command.resource === 'config') {
        printSuccess(await runConfigCommand(command, config, paths));
        return;
    }

    const apiKey = resolveApiKey();
    if (!apiKey) {
        fail('MISSING_CONFIG', 'api key is required. set RR_LICENSE_KEY');
    }

    const client = createRankWranglerClient({
        baseUrl: resolveBaseUrl(optionValues, config, DEFAULT_API_BASE_URL, fail),
        apiKey,
    });

    printSuccess(await runApiCommand(command, client, config));
};

const runApiCommand = async (
    command: CliCommand,
    client: ReturnType<typeof createRankWranglerClient>,
    config: CliConfig
) => {
    if (command.resource === 'products' && command.verb === 'get') {
        const optionValues = values as CliOptionValues;
        const marketplaceId = requireMarketplaceId(optionValues, config);
        const asins = requireAsins(command.args, optionValues, fail);

        if (asins.length === 1) {
            return client.getProductInfo.mutate({ marketplaceId, asin: asins[0] });
        }

        return client.getProductInfoBatch.mutate({ marketplaceId, asins });
    }

    if (command.resource === 'products' && command.verb === 'history') {
        return runProductHistoryCommand(command, client, config);
    }

    if (command.resource === 'license' && command.verb === 'status') {
        return client.license.status.mutate();
    }

    if (command.resource === 'license' && command.verb === 'validate') {
        return client.license.validate.mutate();
    }

    fail('UNKNOWN_COMMAND', 'Unknown command', {
        command: `${command.resource} ${command.verb}`,
    });
};

const runProductHistoryCommand = async (
    command: CliCommand,
    client: ReturnType<typeof createRankWranglerClient>,
    config: CliConfig
) => {
    const optionValues = values as CliOptionValues;
    const asin = requireSingleAsin(command.args, optionValues, fail);
    const marketplaceId = requireMarketplaceId(optionValues, config);
    const metrics = resolveHistoryMetrics(optionValues, fail);
    const historyWindow = resolveHistoryWindow(optionValues, fail);
    const limit = parseIntegerOption(
        {
            value: optionValues.limit,
            optionName: 'limit',
            min: 1,
            max: 10000,
            defaultValue: 5000,
        },
        fail
    );

    const response = await client.getProductHistory.mutate({
        marketplaceId,
        asin,
        metrics,
        format: 'agent',
        limit,
        ...historyWindow,
    });

    return buildCliHistoryResponse({
        asin,
        marketplaceId,
        metrics,
        response: response as AgentHistoryResponse,
    });
};

const runConfigCommand = async (command: CliCommand, config: CliConfig, paths: CliPaths) => {
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

const resolveMetaCommand = (inputPositionals: string[]): CliMetaCommand | null => {
    if (inputPositionals.length === 1 && inputPositionals[0] === 'changelog') {
        return { name: 'changelog' };
    }

    return null;
};

const resolveCommand = (inputPositionals: string[]) => {
    const [first, second, ...rest] = inputPositionals;
    if (!first || !second) {
        return null;
    }

    return {
        resource: first,
        verb: second,
        args: rest,
    };
};

const resolveCommandOrFail = (inputPositionals: string[]): CliCommand => {
    const command = resolveCommand(inputPositionals);
    if (command) {
        return command;
    }

    fail('UNKNOWN_COMMAND', 'Unknown command', { command: inputPositionals.join(' ') });
    throw new Error('unreachable');
};

const isSupportedCommand = (command: CliCommand) => {
    return SUPPORTED_COMMANDS.has(`${command.resource}:${command.verb}`);
};

await main().catch(error => {
    const resolved = resolveError(error);
    fail(resolved.code, resolved.message, resolved.details);
});
