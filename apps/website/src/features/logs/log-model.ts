import type { RouterOutputs } from '@/lib/trpc';

export type EventLogRow = RouterOutputs['api']['app']['eventLogs']['items'][number];
export type EventLogLevel = EventLogRow['level'];
export type EventLogStatus = EventLogRow['status'];
export type EventLogPrimitiveType = EventLogRow['primitiveType'];

/** `all` is the Segment's "no type filter" key; the server takes no type at all. */
export type EventLogTypeFilter = EventLogPrimitiveType | 'all';

export const levelOptions: readonly EventLogLevel[] = ['info', 'warn', 'error', 'debug'];
export const statusOptions: readonly EventLogStatus[] = [
    'success',
    'failed',
    'pending',
    'retrying',
    'partial',
];
export const typeOptions: readonly EventLogPrimitiveType[] = [
    'keyword',
    'product',
    'history',
    'job',
];

export type ChipColor = 'default' | 'accent' | 'success' | 'warning' | 'danger';

/** A chip colour as the terminal's text ink (log cells are coloured words, not chips). */
export const chipInk: Readonly<Record<ChipColor, string>> = {
    accent: 'text-accent',
    danger: 'text-danger',
    default: 'text-muted',
    success: 'text-success',
    warning: 'text-warning',
};

/**
 * Only trouble is coloured: info and success are the normal case on every row,
 * so they stay muted and a warning or failure is what the eye lands on.
 */
export const levelChipColor: Readonly<Record<EventLogLevel, ChipColor>> = {
    debug: 'default',
    error: 'danger',
    info: 'default',
    warn: 'warning',
};

export const statusChipColor: Readonly<Record<EventLogStatus, ChipColor>> = {
    failed: 'danger',
    partial: 'warning',
    pending: 'default',
    retrying: 'warning',
    success: 'default',
};

/**
 * What an event is about, for navigation: a Product page, a Keywords search,
 * or nothing to open. Keyword events name their term in `detailsJson.keyword`.
 */
export type LogSubject =
    | { readonly kind: 'product'; readonly asin: string; readonly marketplaceId: string | null }
    | { readonly kind: 'keyword'; readonly keyword: string }
    | { readonly kind: 'none' };

export const resolveLogSubject = (log: EventLogRow): LogSubject => {
    const keyword = log.detailsJson.keyword;
    if (log.primitiveType === 'keyword' && typeof keyword === 'string' && keyword.length > 0) {
        return { keyword, kind: 'keyword' };
    }
    if (log.asin) {
        return { asin: log.asin, kind: 'product', marketplaceId: log.marketplaceId };
    }
    return { kind: 'none' };
};

export const logSubjectHref = (subject: LogSubject) => {
    switch (subject.kind) {
        case 'product':
            return subject.marketplaceId && subject.marketplaceId !== defaultMarketplaceId
                ? `/products/${subject.asin}?marketplace=${encodeURIComponent(subject.marketplaceId)}`
                : `/products/${subject.asin}`;
        case 'keyword':
            return `/keywords?q=${encodeURIComponent(subject.keyword)}`;
        case 'none':
            return null;
        default:
            return assertNever(subject);
    }
};

export const getTargetLabel = (log: EventLogRow) => {
    const subject = resolveLogSubject(log);
    if (subject.kind === 'keyword') {
        return subject.keyword;
    }
    if (subject.kind === 'product') {
        return subject.marketplaceId ? `${subject.asin} · ${subject.marketplaceId}` : subject.asin;
    }
    return log.jobName ?? '—';
};

export const formatLogTime = (isoDate: string) => {
    const date = new Date(isoDate);
    if (Number.isNaN(date.getTime())) {
        return '--:--:--';
    }
    return timeFormatter.format(date);
};

/** The clock alone (`17:05`), for a phone's narrow time column. */
export const formatLogClock = (isoDate: string) => {
    const date = new Date(isoDate);
    if (Number.isNaN(date.getTime())) {
        return '--:--';
    }
    return clockFormatter.format(date);
};

export const formatLogDateTime = (isoDate: string) => {
    const date = new Date(isoDate);
    if (Number.isNaN(date.getTime())) {
        return 'Invalid date';
    }
    return dateTimeFormatter.format(date);
};

export const formatLogJson = (value: unknown) => {
    try {
        const serialized = JSON.stringify(value, null, 2);
        if (!serialized) {
            return 'null';
        }
        return serialized.length > maxJsonLength
            ? `${serialized.slice(0, maxJsonLength)}\n...truncated`
            : serialized;
    } catch {
        return String(value);
    }
};

const defaultMarketplaceId = 'ATVPDKIKX0DER';
const maxJsonLength = 8000;

const timeFormatter = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    month: 'short',
    second: '2-digit',
});

const clockFormatter = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
});

const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    month: 'short',
    second: '2-digit',
    year: 'numeric',
});

const assertNever = (value: never): never => {
    throw new Error(`Unhandled log subject: ${JSON.stringify(value)}`);
};
