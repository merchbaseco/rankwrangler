import type { CliConfig } from './cli-config';
import {
    HISTORY_BUCKETS,
    HISTORY_METRIC_ALIASES,
    type HistoryBucket,
    type HistoryMetricAlias,
} from './history-options';

type CliFail = (code: string, message: string, details?: unknown) => never;

export interface CliOptionValues {
    baseUrl?: string;
    marketplace?: string;
    metrics?: string;
    startAt?: string;
    endAt?: string;
    days?: string;
    rangeDays?: string;
    limit?: string;
    bucket?: string;
    cursor?: string;
    refresh?: boolean;
    help?: boolean;
    version?: boolean;
}

const ASIN_REGEX = /^[A-Z0-9]{10}$/i;
const TRAILING_SLASHES_REGEX = /\/+$/;
const API_SUFFIX_REGEX = /\/api$/i;
const DEFAULT_MARKETPLACE_ID = 'ATVPDKIKX0DER';

export const requireMarketplaceId = (values: CliOptionValues, config: CliConfig) => {
    return (
        values.marketplace ??
        config.marketplaceId ??
        process.env.RR_MARKETPLACE_ID ??
        DEFAULT_MARKETPLACE_ID
    );
};

export const requireSingleAsin = (
    commandArgs: string[],
    fail: CliFail,
    commandName = 'product history'
) => {
    if (commandArgs.length !== 1) {
        fail('INVALID_INPUT', `${commandName} requires exactly one ASIN`);
    }

    return normalizeAsin(commandArgs[0] ?? '', fail);
};

export const requireAsins = (commandArgs: string[], fail: CliFail, commandName = 'product get') => {
    if (commandArgs.length < 1 || commandArgs.length > 200) {
        fail('INVALID_INPUT', `${commandName} requires between 1 and 200 ASINs`);
    }

    const asins = commandArgs.map(value => normalizeAsin(value, fail));
    if (new Set(asins).size !== asins.length) {
        fail('INVALID_INPUT', `${commandName} requires unique ASINs`);
    }

    return asins;
};

export const resolveHistoryMetrics = (values: CliOptionValues, fail: CliFail) => {
    const requested = (values.metrics ?? process.env.RR_HISTORY_METRICS ?? 'salesRank,price')
        .split(',')
        .map(value => normalizeHistoryMetric(value.trim()))
        .filter(Boolean);

    if (requested.length === 0) {
        fail('INVALID_INPUT', 'metrics cannot be empty');
    }

    const invalid = requested.filter(
        value => !HISTORY_METRIC_ALIASES.includes(value as HistoryMetricAlias)
    );
    if (invalid.length > 0) {
        fail('INVALID_INPUT', `unsupported history metric: ${invalid[0]}`, {
            supportedMetrics: HISTORY_METRIC_ALIASES,
        });
    }

    return Array.from(new Set(requested)) as HistoryMetricAlias[];
};

export const resolveHistoryBucket = (values: CliOptionValues, fail: CliFail) => {
    const requested = (values.bucket ?? 'auto').trim().toLowerCase();
    if (!HISTORY_BUCKETS.includes(requested as HistoryBucket)) {
        fail('INVALID_INPUT', `unsupported history bucket: ${requested}`, {
            supportedBuckets: HISTORY_BUCKETS,
        });
    }

    return requested as HistoryBucket;
};

export const resolveHistoryWindow = (values: CliOptionValues, fail: CliFail) => {
    const startAt = values.startAt
        ? normalizeDateOption('startAt', values.startAt, fail)
        : undefined;
    const endAt = values.endAt ? normalizeDateOption('endAt', values.endAt, fail) : undefined;
    if (values.days && (startAt || endAt)) {
        fail('INVALID_INPUT', 'use --days or --startAt/--endAt, not both');
    }

    return {
        ...(startAt ? { startAt } : {}),
        ...(endAt ? { endAt } : {}),
        days: parseIntegerOption(
            {
                value: values.days,
                optionName: 'days',
                min: 30,
                max: 3650,
                defaultValue: 365,
            },
            fail
        ),
    };
};

export const resolveBaseUrl = (
    values: CliOptionValues,
    config: CliConfig,
    defaultBaseUrl: string,
    fail: CliFail
) => {
    return normalizeBaseUrl(
        values.baseUrl ?? config.baseUrl ?? process.env.RR_API_URL ?? defaultBaseUrl,
        fail
    );
};

export const normalizeBaseUrl = (value: string, fail: CliFail) => {
    const normalized = value
        .trim()
        .replace(TRAILING_SLASHES_REGEX, '')
        .replace(API_SUFFIX_REGEX, '');
    if (!normalized) {
        fail('INVALID_INPUT', 'base url cannot be empty');
    }

    return normalized;
};

export const parseIntegerOption = (
    {
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
    },
    fail: CliFail
) => {
    if (!value) {
        return defaultValue;
    }

    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
        fail('INVALID_INPUT', `${optionName} must be an integer between ${min} and ${max}`);
    }

    return parsed;
};

const normalizeDateOption = (optionName: string, value: string, fail: CliFail) => {
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) {
        fail('INVALID_INPUT', `${optionName} must be a valid date`);
    }

    return parsed.toISOString();
};

const normalizeAsin = (value: string, fail: CliFail) => {
    const normalized = value.trim().toUpperCase();
    if (!ASIN_REGEX.test(normalized)) {
        fail('INVALID_INPUT', `invalid ASIN: ${value}`);
    }

    return normalized;
};

const normalizeHistoryMetric = (value: string) => {
    if (value.toLowerCase() === 'salesrank') {
        return 'salesRank';
    }
    if (value.toLowerCase() === 'price') {
        return 'price';
    }
    return value;
};
