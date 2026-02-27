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
const HISTORY_METRIC_ALIASES = ['bsr', 'price'] as const;

type HistoryMetricAlias = (typeof HISTORY_METRIC_ALIASES)[number];
type HistoryPointTuple = [string, number | null] | [string, null, 1];

type AgentHistorySeries = {
    bsr?: {
        unit: 'rank';
        category: { id: number; name: string | null } | null;
        points: HistoryPointTuple[];
    };
    price?: {
        unit: 'minorCurrency';
        currencyCode: 'USD';
        valueScale: 100;
        points: HistoryPointTuple[];
    };
};

type AgentHistoryResponse = {
    schemaVersion?: number;
    status?: string;
    syncTriggered: boolean;
    latestImportAt: string | null;
    series?: AgentHistorySeries;
};

const CONFIG_DIR = path.join(homedir(), '.rankwrangler');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

const DEFAULT_OUTPUT_PRETTY = true;
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
        apiKey: { type: 'string' },
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
    return null;
};

const runProductHistoryCommand = async (
    command: CliCommand,
    client: ReturnType<typeof createRankWranglerClient>,
    config: CliConfig
) => {
    const marketplaceId = requireMarketplaceId(config);
    const asin = requireSingleAsin(command.args);
    const metrics = resolveHistoryMetrics();
    const historyWindow = resolveHistoryWindow();
    const limit = parseIntegerOption({
        value: values.limit,
        optionName: 'limit',
        min: 1,
        max: 10000,
        defaultValue: 5000,
    });

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
        response,
    });
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

const requireSingleAsin = (commandArgs: string[]) => {
    const asins = requireAsins(commandArgs);
    if (asins.length !== 1) {
        fail('INVALID_INPUT', 'products history requires exactly one asin');
    }

    return asins[0];
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

const resolveHistoryMetrics = () => {
    const rawMetrics = values.metrics ?? process.env.RR_HISTORY_METRICS ?? 'bsr,price';
    const requested = rawMetrics
        .split(',')
        .map(value => value.trim().toLowerCase())
        .filter(Boolean);

    if (requested.length === 0) {
        fail('INVALID_INPUT', 'metrics cannot be empty');
    }

    const invalid = requested.filter(value => !HISTORY_METRIC_ALIASES.includes(value as HistoryMetricAlias));
    if (invalid.length > 0) {
        fail('INVALID_INPUT', `unsupported history metric: ${invalid[0]}`, {
            supportedMetrics: HISTORY_METRIC_ALIASES,
        });
    }

    return Array.from(new Set(requested)) as HistoryMetricAlias[];
};

const resolveHistoryWindow = () => {
    const startAt = values.startAt ? normalizeDateOption('startAt', values.startAt) : undefined;
    const endAt = values.endAt ? normalizeDateOption('endAt', values.endAt) : undefined;
    const days = parseIntegerOption({
        value: values.days,
        optionName: 'days',
        min: 30,
        max: 3650,
        defaultValue: 365,
    });

    if (values.days && (startAt || endAt)) {
        fail('INVALID_INPUT', 'use --days or --startAt/--endAt, not both');
    }

    return {
        ...(startAt ? { startAt } : {}),
        ...(endAt ? { endAt } : {}),
        days,
    };
};

const parseIntegerOption = ({
    value,
    optionName,
    min,
    max,
    defaultValue,
}: {
    value: string | undefined;
    optionName: string;
    min: number;
    max: number;
    defaultValue: number;
}) => {
    if (!value) {
        return defaultValue;
    }

    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
        fail('INVALID_INPUT', `${optionName} must be an integer between ${min} and ${max}`);
    }

    return parsed;
};

const normalizeDateOption = (optionName: string, value: string) => {
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) {
        fail('INVALID_INPUT', `${optionName} must be a valid date`);
    }

    return parsed.toISOString();
};

const buildCliHistoryResponse = ({
    asin,
    marketplaceId,
    metrics,
    response,
}: {
    asin: string;
    marketplaceId: string;
    metrics: HistoryMetricAlias[];
    response: AgentHistoryResponse;
}) => {
    const series: AgentHistorySeries = {
        ...(metrics.includes('bsr') && response.series?.bsr ? { bsr: response.series.bsr } : {}),
        ...(metrics.includes('price') && response.series?.price ? { price: response.series.price } : {}),
    };
    const hasAnyPoints = Object.values(series).some(metricSeries => metricSeries.points.length > 0);
    const status = normalizeHistoryStatus(response.status);

    return {
        schemaVersion: response.schemaVersion ?? 1,
        asin,
        marketplaceId,
        status: status ?? (response.syncTriggered ? 'collecting' : hasAnyPoints ? 'ready' : 'empty'),
        latestImportAt: response.latestImportAt,
        syncTriggered: response.syncTriggered,
        series,
    };
};

const normalizeHistoryStatus = (status: string | undefined) => {
    if (status === 'ready' || status === 'collecting' || status === 'empty') {
        return status;
    }

    return null;
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
        '  products history <ASIN>',
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
        '  --metrics <list>         History metrics: bsr,price (default: bsr,price)',
        '  --days <N>               History lookback window (30-3650, default: 365)',
        '  --startAt <ISO>          History range start (ISO date/time)',
        '  --endAt <ISO>            History range end (ISO date/time)',
        '  --limit <N>              Max points per metric (1-10000, default: 5000)',
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
        '  RR_HISTORY_METRICS       Comma-separated history metrics fallback',
        '',
        'EXAMPLES',
        '  rw config set api-key rrk_...',
        '  rw products get B0DV53VS61',
        '  rw products history B0DV53VS61 --metrics bsr,price',
        '  rw products history B0DV53VS61 --startAt 2025-01-01 --endAt 2025-12-31',
        '  rankwrangler license status',
    ];

    console.log(usage.join('\n'));
};

await main().catch(error => {
    const resolved = resolveError(error);
    fail(resolved.code, resolved.message, resolved.details);
});
