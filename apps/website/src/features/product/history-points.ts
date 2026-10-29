import type { RouterOutputs } from '@/lib/trpc';

type HistoryRead = RouterOutputs['api']['app']['getProductHistory'];

/**
 * The raw samples of a `getProductHistory` read. The procedure always answers
 * the points format for the app, but its return type is the union of every
 * format the shared history surface can produce, so this narrows it.
 */
export const historyPoints = (read: HistoryRead | undefined) =>
    read && 'points' in read ? read.points : [];
