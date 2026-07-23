#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { createRankWranglerClient, DEFAULT_API_BASE_URL } from '@rankwrangler/http-client';
import { resolveApiKey, runAuthCommand } from './cli-auth';
import { printBundledChangelog, printCliVersion } from './cli-metadata';
import { runConfigCommand } from './cli-config-command';
import { loadCliContext, loadCliPathsOrDefault, type CliConfig } from './cli-config';
import {
    parseIntegerOption,
    requireMarketplaceId,
    requireSingleAsin,
    resolveBaseUrl,
    resolveHistoryBucket,
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
    'products:summary',
    'products:history',
    'operations:get',
    'license:status',
    'license:validate',
    'auth:status',
    'auth:set',
    'auth:clear',
    'config:show',
    'config:get',
    'config:unset',
    'config:reset',
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
        bucket: { type: 'string' },
        stdin: { type: 'boolean' },
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
        printSuccess(await runConfigCommand(command, config, paths, fail));
        return;
    }

    if (command.resource === 'auth') {
        printSuccess(await runAuthCommand(command, fail, { stdin: Boolean(values.stdin) }));
        return;
    }

    const apiKey = await resolveApiKey();
    if (!apiKey) {
        fail(
            'MISSING_CONFIG',
            'license key is required. run `rw auth set`, `rw auth set --stdin`, or set RR_LICENSE_KEY'
        );
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
        return runProductGetCommand(command, client, config);
    }

    if (command.resource === 'products' && command.verb === 'summary') {
        return runProductSummaryCommand(command, client, config);
    }

    if (command.resource === 'products' && command.verb === 'history') {
        return runProductHistoryCommand(command, client, config);
    }

    if (command.resource === 'operations' && command.verb === 'get') {
        return runOperationGetCommand(command, client);
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

const runOperationGetCommand = async (
    command: CliCommand,
    client: ReturnType<typeof createRankWranglerClient>
) => {
    if (command.args.length !== 1) {
        fail('INVALID_INPUT', 'operations get requires exactly one id');
    }

    return await client.operation.get.query({ id: command.args[0] });
};

const runProductGetCommand = async (
    command: CliCommand,
    client: ReturnType<typeof createRankWranglerClient>,
    config: CliConfig
) => {
    const optionValues = values as CliOptionValues;
    const asin = requireSingleAsin(command.args, optionValues, fail, 'products get');
    const marketplaceId = requireMarketplaceId(optionValues, config);
    const metrics = resolveHistoryMetrics(optionValues, fail);
    const bucket = resolveHistoryBucket(optionValues, fail);
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

    return await client.product.get.mutate({
        marketplaceId,
        asin,
        metrics,
        bucket,
        limit,
        ...historyWindow,
    });
};

const runProductSummaryCommand = async (
    command: CliCommand,
    client: ReturnType<typeof createRankWranglerClient>,
    config: CliConfig
) => {
    const optionValues = values as CliOptionValues;
    const asin = requireSingleAsin(command.args, optionValues, fail, 'products summary');
    const marketplaceId = requireMarketplaceId(optionValues, config);

    return await client.product.getSummary.mutate({ marketplaceId, asin });
};

const runProductHistoryCommand = async (
    command: CliCommand,
    client: ReturnType<typeof createRankWranglerClient>,
    config: CliConfig
) => {
    const optionValues = values as CliOptionValues;
    const asin = requireSingleAsin(command.args, optionValues, fail, 'products history');
    const marketplaceId = requireMarketplaceId(optionValues, config);
    const metrics = resolveHistoryMetrics(optionValues, fail);
    const bucket = resolveHistoryBucket(optionValues, fail);
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

    const response = await client.product.getHistory.mutate({
        marketplaceId,
        asin,
        metrics,
        format: 'agent',
        bucket,
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
