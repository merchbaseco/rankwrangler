import postgres from 'postgres';

export type ReportPeriod = 'ALL' | 'DAY' | 'WEEK';

export type SnapshotRow = {
    id: string;
    marketplace_id: string;
    report_period: 'DAY' | 'WEEK';
    data_end_date: string;
    observed_date: string;
    keyword_count: number;
};

export type KeywordRow = {
    id: string;
    search_term: string;
    is_merch_relevant: boolean;
    merch_reason: string;
};

export type ChangeRow = {
    snapshotId: string;
    reportPeriod: 'DAY' | 'WEEK';
    marketplaceId: string;
    dataEndDate: string;
    observedDate: string;
    searchTerm: string;
    previousRelevant: boolean;
    nextRelevant: boolean;
    previousReason: string;
    nextReason: string;
};

export type SnapshotSummary = {
    snapshotId: string;
    reportPeriod: 'DAY' | 'WEEK';
    marketplaceId: string;
    dataEndDate: string;
    observedDate: string;
    previousKeywordCount: number;
    nextKeywordCount: number;
    changedRows: number;
};

export type CliOptions = {
    reportPeriod: ReportPeriod;
    snapshotLimit: number | null;
    sampleSize: number;
    shouldWrite: boolean;
    marketplaceId: string | null;
};

export type DryRunSummary = {
    totalSnapshots: number;
    totalRowsScanned: number;
    totalChangedRows: number;
    totalFlipsToIrrelevant: number;
    totalFlipsToRelevant: number;
    totalReasonOnlyChanges: number;
    wouldRemoveRows: number;
    affectedSnapshots: number;
    removedByReason: Map<string, number>;
    changedSamples: ChangeRow[];
    snapshotSummaries: SnapshotSummary[];
};

export const createClient = () => {
    return postgres({
        host: process.env.DATABASE_HOST || 'postgres',
        port: Number(process.env.DATABASE_PORT || 5432),
        database: process.env.DATABASE_NAME || 'rankwrangler',
        username: process.env.DATABASE_USER || 'rankwrangler',
        password: process.env.DATABASE_PASSWORD || 'SecurePass123',
        max: 1,
    });
};

export const parseArgs = (args: string[]): CliOptions => {
    let reportPeriod: ReportPeriod = 'ALL';
    let snapshotLimit: number | null = null;
    let sampleSize = 25;
    let shouldWrite = false;
    let marketplaceId: string | null = null;

    for (const arg of args) {
        if (arg === '--write') {
            shouldWrite = true;
            continue;
        }

        if (arg === '--dry-run') {
            shouldWrite = false;
            continue;
        }

        if (arg.startsWith('--report-period=')) {
            const value = arg.split('=')[1]?.toUpperCase();
            if (value === 'DAY' || value === 'WEEK' || value === 'ALL') {
                reportPeriod = value;
                continue;
            }

            throw new Error(`Invalid --report-period value: ${arg}`);
        }

        if (arg.startsWith('--snapshot-limit=')) {
            snapshotLimit = parsePositiveInteger(arg, '--snapshot-limit');
            continue;
        }

        if (arg.startsWith('--sample-size=')) {
            sampleSize = parsePositiveInteger(arg, '--sample-size');
            continue;
        }

        if (arg.startsWith('--marketplace-id=')) {
            marketplaceId = arg.split('=')[1]?.trim() || null;
            continue;
        }

        throw new Error(`Unknown argument: ${arg}`);
    }

    return {
        reportPeriod,
        snapshotLimit,
        sampleSize,
        shouldWrite,
        marketplaceId,
    };
};

export const incrementMap = (map: Map<string, number>, key: string) => {
    map.set(key, (map.get(key) ?? 0) + 1);
};

export const printSummary = (summary: DryRunSummary, options: CliOptions) => {
    console.log(`Mode: ${options.shouldWrite ? 'write' : 'dry-run'}`);
    console.log(`Snapshots scanned: ${summary.totalSnapshots}`);
    console.log(`Rows scanned: ${summary.totalRowsScanned}`);
    console.log(`Changed rows: ${summary.totalChangedRows}`);
    console.log(`Flips to irrelevant: ${summary.totalFlipsToIrrelevant}`);
    console.log(`Flips to relevant: ${summary.totalFlipsToRelevant}`);
    console.log(`Reason-only changes: ${summary.totalReasonOnlyChanges}`);
    console.log(`Affected snapshots: ${summary.affectedSnapshots}`);

    if (summary.removedByReason.size > 0) {
        console.log('\nRows removed by reason:');
        for (const [reason, count] of [...summary.removedByReason.entries()].sort(
            (a, b) => b[1] - a[1]
        )) {
            console.log(`  ${count}\t${reason}`);
        }
    }

    if (summary.snapshotSummaries.length > 0) {
        console.log('\nMost affected snapshots:');
        for (const snapshot of [...summary.snapshotSummaries]
            .sort((a, b) => b.changedRows - a.changedRows)
            .slice(0, 10)) {
            console.log(
                `  ${snapshot.reportPeriod} ${snapshot.dataEndDate} ${snapshot.marketplaceId}` +
                    ` changed=${snapshot.changedRows} count=${snapshot.previousKeywordCount}->${snapshot.nextKeywordCount}`
            );
        }
    }

    if (summary.changedSamples.length > 0) {
        console.log('\nSample changes:');
        for (const sample of summary.changedSamples) {
            console.log(
                `  ${sample.reportPeriod} ${sample.dataEndDate} ${sample.searchTerm}` +
                    ` :: ${sample.previousReason} -> ${sample.nextReason}`
            );
        }
    }
};

const parsePositiveInteger = (arg: string, flagName: string) => {
    const raw = arg.split('=')[1];
    const value = Number(raw);
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`Invalid ${flagName} value: ${arg}`);
    }

    return value;
};
