#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { createRankWranglerClient, DEFAULT_API_BASE_URL } from '@rankwrangler/http-client';
import { resolveApiKey, runAuthCommand } from './cli-auth';
import { type CliConfig, loadCliContext, loadCliPathsOrDefault } from './cli-config';
import { runConfigCommand } from './cli-config-command';
import { runKeywordCommand } from './cli-keyword-command';
import { printBundledChangelog, printCliVersion } from './cli-metadata';
import { type CliOptionValues, resolveBaseUrl } from './cli-options';
import { fail, printSuccess, resolveError } from './cli-output';
import { runProductCommand } from './cli-product-command';
import { printUsage } from './usage';

interface CliCommand {
    resource: string;
    verb: string;
    args: string[];
}

interface CliMetaCommand {
    name: 'changelog';
}

const SUPPORTED_COMMANDS = new Set([
    'product:get',
    'product:search',
    'product:history',
    'keyword:get',
    'keyword:search',
    'keyword:history',
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
        metrics: { type: 'string' },
        startAt: { type: 'string' },
        endAt: { type: 'string' },
        days: { type: 'string' },
        rangeDays: { type: 'string' },
        limit: { type: 'string' },
        bucket: { type: 'string' },
        cursor: { type: 'string' },
        refresh: { type: 'boolean' },
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
    if (metaCommand?.name === 'changelog') {
        printBundledChangelog();
        return;
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
        printSuccess(
            await runAuthCommand(command, fail, {
                stdin: Boolean((values as { stdin?: boolean }).stdin),
            })
        );
        return;
    }

    const apiKey = await resolveApiKey();
    if (!apiKey) {
        fail(
            'MISSING_CONFIG',
            'Merchbase API key is required. run `rw auth set`, `rw auth set --stdin`, or set MERCHBASE_API_KEY'
        );
    }

    const client = createRankWranglerClient({
        baseUrl: resolveBaseUrl(optionValues, config, DEFAULT_API_BASE_URL, fail),
        apiKey,
    });

    printSuccess(await runApiCommand(command, client, config, optionValues));
};

const runApiCommand = async (
    command: CliCommand,
    client: ReturnType<typeof createRankWranglerClient>,
    config: CliConfig,
    options: CliOptionValues
) => {
    if (command.resource === 'product') {
        return await runProductCommand(command, client, config, options, fail);
    }
    if (command.resource === 'keyword') {
        return await runKeywordCommand(command, client, options, fail);
    }

    fail('UNKNOWN_COMMAND', 'Unknown command', {
        command: `${command.resource} ${command.verb}`,
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
    if (!(first && second)) {
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

const isSupportedCommand = (command: CliCommand) =>
    SUPPORTED_COMMANDS.has(`${command.resource}:${command.verb}`);

await main().catch(error => {
    const resolved = resolveError(error);
    fail(resolved.code, resolved.message, resolved.details);
});
