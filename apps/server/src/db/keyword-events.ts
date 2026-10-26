import type { db } from './index';
import { eventLogs } from './ops-schema';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export const writeKeywordEvents = async (
    tx: Transaction,
    events: {
        id: string;
        term: string;
        action: string;
        occurredAt: Date;
        details?: Record<string, unknown>;
        status?: 'success' | 'failed';
    }[]
) => {
    if (!events.length) return;
    await tx.insert(eventLogs).values(
        events.map(event => ({
            accountId: 'global',
            occurredAt: event.occurredAt,
            level: event.status === 'failed' ? 'error' : 'info',
            status: event.status ?? 'success',
            category: 'keyword',
            action: event.action,
            primitiveType: 'keyword',
            primitiveId: event.id,
            marketplaceId: 'ATVPDKIKX0DER',
            message: `${event.term}: ${event.action.replace('keyword.', '').replaceAll('.', ' ')}`,
            detailsJson: { keyword: event.term, ...event.details },
        }))
    );
};
