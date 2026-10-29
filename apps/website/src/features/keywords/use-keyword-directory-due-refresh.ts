import { useEffect } from 'react';
import { api } from '@/lib/trpc';
import type { DirectoryInput, DirectoryRow } from './keyword-directory-cache';

/**
 * Status and order are computed at the first page's asOf, so a check coming due changes a row
 * without any database event. One timer, armed for the earliest due row, re-reads the loaded
 * pages at a fresh asOf; nothing repeats while no loaded row is waiting to come due.
 */
export const useKeywordDirectoryDueRefresh = (
    input: DirectoryInput,
    rows: readonly DirectoryRow[]
) => {
    const utils = api.useUtils();
    const dueAt = earliestFutureCheck(rows);
    useEffect(() => {
        if (dueAt === null) {
            return;
        }
        const timer = setTimeout(
            () => {
                utils.api.app.keywordDirectory.invalidate(input).catch(() => undefined);
            },
            Math.min(maxTimerMs, Math.max(minDelayMs, dueAt - Date.now()))
        );
        return () => clearTimeout(timer);
    }, [dueAt, input, utils]);
};

const minDelayMs = 30_000;
const maxTimerMs = 2_147_483_647;

const earliestFutureCheck = (rows: readonly DirectoryRow[]) => {
    const now = Date.now();
    let earliest: number | null = null;
    for (const row of rows) {
        const at = row.nextCheckAt ? Date.parse(row.nextCheckAt) : Number.NaN;
        if (at > now && (earliest === null || at < earliest)) {
            earliest = at;
        }
    }
    return earliest;
};
