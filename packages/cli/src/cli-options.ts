import type { CliConfig } from './cli-config';
import { HISTORY_METRIC_ALIASES, type HistoryMetricAlias } from './history-response';

type CliFail = (code: string, message: string, details?: unknown) => never;

export type CliOptionValues = {
    baseUrl?: string;
    marketplace?: string;
    asin?: string[];
    metrics?: string;
    startAt?: string;
    endAt?: string;
    days?: string;
    limit?: string;
    help?: boolean;
};

const ASIN_REGEX = /^[A-Z0-9]{10}$/i;
const TRAILING_SLASHES_REGEX = /\/+$/;
const API_SUFFIX_REGEX = /\/api$/i;
const DEFAULT_MARKETPLACE_ID = 'ATVPDKIKX0DER';

export const requireMarketplaceId = (values: CliOptionValues, config: CliConfig) => {
    return values.marketplace ?? config.marketplaceId ?? process.env.RR_MARKETPLACE_ID ?? DEFAULT_MARKETPLACE_ID;
};

export const requireAsins = (commandArgs: string[], values: CliOptionValues, fail: CliFail) => {
    const candidates = [...commandArgs, ...(values.asin ?? []), ...resolveEnvAsins()]
        .map(value => value.trim())
        .filter(Boolean);

    if (candidates.length === 0) {
        fail('INVALID_INPUT', 'at least one asin is required');
    }

    return Array.from(new Set(candidates.map(value => normalizeAsin(value, fail))));
};

export const requireSingleAsin = (
    commandArgs: string[],
    values: CliOptionValues,
    fail: CliFail
) => {
    const asins = requireAsins(commandArgs, values, fail);
    if (asins.length !== 1) {
        fail('INVALID_INPUT', 'products history requires exactly one asin');
    }

    return asins[0];
};

export const resolveHistoryMetrics = (values: CliOptionValues, fail: CliFail) => {
    const requested = (values.metrics ?? process.env.RR_HISTORY_METRICS ?? 'bsr,price')
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

export const resolveHistoryWindow = (values: CliOptionValues, fail: CliFail) => {
    const startAt = values.startAt ? normalizeDateOption('startAt', values.startAt, fail) : undefined;
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

export const resolveApiKey = () => {
    return process.env.RR_LICENSE_KEY;
};

export const resolveBaseUrl = (
    values: CliOptionValues,
    config: CliConfig,
    defaultBaseUrl: string,
    fail: CliFail
) => {
    return normalizeBaseUrl(values.baseUrl ?? config.baseUrl ?? process.env.RR_API_URL ?? defaultBaseUrl, fail);
};

export const normalizeBaseUrl = (value: string, fail: CliFail) => {
    const normalized = value.trim().replace(TRAILING_SLASHES_REGEX, '').replace(API_SUFFIX_REGEX, '');
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

const resolveEnvAsins = () => {
    return [
        ...(process.env.RR_ASINS ? process.env.RR_ASINS.split(',') : []),
        ...(process.env.RR_ASIN ? [process.env.RR_ASIN] : []),
    ];
};
