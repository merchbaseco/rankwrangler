#!/usr/bin/env node

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { createRankWranglerClient, DEFAULT_API_BASE_URL } from '@rankwrangler/http-client';

type CliConfig = {
    apiKey?: string;
    baseUrl?: string;
    marketplaceId?: string;
};

type CliCommand = {
    resource: string;
    verb: string;
    args: string[];
};

type CliSuccess<T> = {
    ok: true;
    data: T;
};

type CliFailure = {
    ok: false;
    error: {
        code: string;
        message: string;
        details?: unknown;
    };
};

const ASIN_REGEX = /^[A-Z0-9]{10}$/i;
const TRAILING_SLASHES_REGEX = /\/+$/;
const API_SUFFIX_REGEX = /\/api$/i;
const DEFAULT_MARKETPLACE_ID = 'ATVPDKIKX0DER';

const CONFIG_DIR = path.join(homedir(), '.rankwrangler');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

const DEFAULT_OUTPUT_PRETTY = true;
const SUPPORTED_COMMANDS = new Set([
    'products:get',
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
        apiKey: { type: 'string' },
        baseUrl: { type: 'string' },
        marketplace: { type: 'string', short: 'm' },
        asin: { type: 'string', multiple: true },
    },
    allowPositionals: true,
});

const outputPretty = DEFAULT_OUTPUT_PRETTY;

const main = async () => {
    if (values.help || positionals.length === 0) {
        printUsage();
        process.exit(values.help ? 0 : 1);
    }

    const command = resolveCommand(positionals);
    if (!command) {
        fail('UNKNOWN_COMMAND', 'Unknown command', { command: positionals.join(' ') });
        return;
    }
    if (!isSupportedCommand(command)) {
        fail('UNKNOWN_COMMAND', 'Unknown command', { command: `${command.resource} ${command.verb}` });
        return;
    }

    const config = await loadConfig();

    if (command.resource === 'config') {
        const response = await runConfigCommand(command, config);
        printSuccess(response);
        return;
    }

    const apiKey = resolveApiKey(config);
    if (!apiKey) {
        fail('MISSING_CONFIG', 'api key is required. set via `config set api-key <value>`');
        return;
    }

    const baseUrl = resolveBaseUrl(config);
    const client = createRankWranglerClient({
        baseUrl,
        apiKey,
    });

    const response = await runApiCommand(command, client, config);
    printSuccess(response);
};

const runApiCommand = async (
    command: CliCommand,
    client: ReturnType<typeof createRankWranglerClient>,
    config: CliConfig
) => {
    if (command.resource === 'products' && command.verb === 'get') {
        const marketplaceId = requireMarketplaceId(config);
        const asins = requireAsins(command.args);

        if (asins.length === 1) {
            return client.getProductInfo.mutate({ marketplaceId, asin: asins[0] });
        }

        return client.getProductInfoBatch.mutate({ marketplaceId, asins });
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
    return null;
};

const runConfigCommand = async (command: CliCommand, config: CliConfig) => {
    if (command.verb === 'show') {
        return {
            path: CONFIG_PATH,
            config,
        };
    }

    if (command.verb === 'clear') {
        await rm(CONFIG_PATH, { force: true });
        return {
            path: CONFIG_PATH,
            cleared: true,
        };
    }

    if (command.verb === 'set') {
        const [key, ...valueParts] = command.args;
        if (!key || valueParts.length === 0) {
            fail('INVALID_INPUT', 'config set requires <key> <value>');
            return null;
        }

        const value = valueParts.join(' ').trim();
        if (!value) {
            fail('INVALID_INPUT', 'config set value cannot be empty');
            return null;
        }

        const nextConfig = { ...config };

        if (key === 'api-key') {
            nextConfig.apiKey = value;
        } else if (key === 'base-url') {
            nextConfig.baseUrl = normalizeBaseUrl(value);
        } else if (key === 'marketplace') {
            nextConfig.marketplaceId = value;
        } else {
            fail('INVALID_INPUT', 'unsupported config key', {
                key,
                supportedKeys: ['api-key', 'base-url', 'marketplace'],
            });
            return null;
        }

        await saveConfig(nextConfig);

        return {
            path: CONFIG_PATH,
            config: nextConfig,
        };
    }

    fail('UNKNOWN_COMMAND', 'Unknown config command', { verb: command.verb });
    return null;
};

const requireMarketplaceId = (config: CliConfig) => {
    const marketplaceId =
        values.marketplace ?? config.marketplaceId ?? process.env.RR_MARKETPLACE_ID ?? DEFAULT_MARKETPLACE_ID;

    return marketplaceId;
};

const requireAsins = (commandArgs: string[]) => {
    const candidates = collectAsinCandidates(commandArgs);

    if (candidates.length === 0) {
        fail('INVALID_INPUT', 'at least one asin is required');
    }

    return Array.from(new Set(candidates.map(normalizeAsin)));
};

const collectAsinCandidates = (commandArgs: string[]) => {
    const optionAsins = [...(values.asin ?? [])];
    const envAsins = process.env.RR_ASINS
        ? process.env.RR_ASINS.split(',').map(value => value.trim())
        : [];
    const envSingleAsin = process.env.RR_ASIN ? [process.env.RR_ASIN] : [];

    return [...commandArgs, ...optionAsins, ...envAsins, ...envSingleAsin]
        .map(value => value.trim())
        .filter(Boolean);
};

const normalizeAsin = (value: string) => {
    const normalized = value.trim().toUpperCase();
    if (!ASIN_REGEX.test(normalized)) {
        fail('INVALID_INPUT', `invalid ASIN: ${value}`);
    }

    return normalized;
};

const resolveApiKey = (config: CliConfig) => {
    return values.apiKey ?? config.apiKey ?? process.env.RR_LICENSE_KEY;
};

const resolveBaseUrl = (config: CliConfig) => {
    const configured = values.baseUrl ?? config.baseUrl ?? process.env.RR_API_URL;

    return normalizeBaseUrl(configured ?? DEFAULT_API_BASE_URL);
};

const normalizeBaseUrl = (value: string) => {
    const trimmed = value.trim();
    const withoutTrailingSlashes = trimmed.replace(TRAILING_SLASHES_REGEX, '');
    const withoutApiSuffix = withoutTrailingSlashes.replace(API_SUFFIX_REGEX, '');

    if (!withoutApiSuffix) {
        fail('INVALID_INPUT', 'base url cannot be empty');
    }

    return withoutApiSuffix;
};

const resolveCommand = (inputPositionals: string[]): CliCommand | null => {
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

const isSupportedCommand = (command: CliCommand) => {
    return SUPPORTED_COMMANDS.has(`${command.resource}:${command.verb}`);
};

const loadConfig = async (): Promise<CliConfig> => {
    try {
        const raw = await readFile(CONFIG_PATH, 'utf8');
        const parsed = JSON.parse(raw) as Record<string, unknown>;

        return {
            apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : undefined,
            baseUrl: typeof parsed.baseUrl === 'string' ? normalizeBaseUrl(parsed.baseUrl) : undefined,
            marketplaceId:
                typeof parsed.marketplaceId === 'string' ? parsed.marketplaceId : undefined,
        };
    } catch (error) {
        if (
            error &&
            typeof error === 'object' &&
            'code' in error &&
            (error as { code?: string }).code === 'ENOENT'
        ) {
            return {};
        }

        fail('INVALID_CONFIG', 'failed to read config', { path: CONFIG_PATH });
        return {};
    }
};

const saveConfig = async (config: CliConfig) => {
    await mkdir(CONFIG_DIR, { recursive: true });
    await writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
};

const resolveError = (error: unknown) => {
    if (error && typeof error === 'object') {
        if ('data' in error) {
            const data = (error as { data?: { code?: string; httpStatus?: number } }).data;
            if (data?.code) {
                return {
                    code: data.code,
                    message:
                        error instanceof Error
                            ? error.message
                            : 'Request failed',
                    details: data.httpStatus ? { httpStatus: data.httpStatus } : undefined,
                };
            }
        }

        if ('message' in error && typeof (error as { message?: unknown }).message === 'string') {
            return {
                code: 'REQUEST_FAILED',
                message: (error as { message: string }).message,
            };
        }
    }

    return {
        code: 'UNKNOWN_ERROR',
        message: 'Unknown error',
    };
};

const printSuccess = <T>(data: T) => {
    const envelope: CliSuccess<T> = {
        ok: true,
        data,
    };

    console.log(JSON.stringify(envelope, null, outputPretty ? 2 : undefined));
};

const fail = (code: string, message: string, details?: unknown): never => {
    const envelope: CliFailure = {
        ok: false,
        error: {
            code,
            message,
            ...(details !== undefined ? { details } : {}),
        },
    };

    console.error(JSON.stringify(envelope, null, outputPretty ? 2 : undefined));
    process.exit(1);
};

const printUsage = () => {
    const usage = [
        'NAME',
        '  rw, rankwrangler - RankWrangler command line interface',
        '',
        'SYNOPSIS',
        '  rw <resource> <verb> [args...] [options]',
        '  rankwrangler <resource> <verb> [args...] [options]',
        '',
        'COMMANDS',
        '  products get <ASIN...>',
        '  license status',
        '  license validate',
        '  config show',
        '  config clear',
        '  config set api-key <value>',
        '  config set base-url <origin>',
        '  config set marketplace <marketplaceId>',
        '',
        'OPTIONS',
        '  -h, --help               Show this help message',
        '  --apiKey <value>         Override API key',
        '  --baseUrl <origin>       Override API origin',
        `  -m, --marketplace <id>   Override marketplace (default: ${DEFAULT_MARKETPLACE_ID})`,
        '  --asin <ASIN>            Add ASIN (repeatable)',
        '',
        'FILES',
        `  ${CONFIG_PATH}           Local CLI config`,
        '',
        'ENVIRONMENT',
        '  RR_LICENSE_KEY           API key fallback',
        '  RR_API_URL               API origin fallback',
        '  RR_MARKETPLACE_ID        Marketplace fallback',
        '  RR_ASIN                  Single ASIN fallback',
        '  RR_ASINS                 Comma-separated ASIN fallback',
        '',
        'EXAMPLES',
        '  rw config set api-key rrk_...',
        '  rw products get B0DV53VS61',
        '  rankwrangler license status',
    ];

    console.log(usage.join('\n'));
};

await main().catch(error => {
    const resolved = resolveError(error);
    fail(resolved.code, resolved.message, resolved.details);
});
