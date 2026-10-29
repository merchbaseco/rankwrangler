import { z } from 'zod';
import { createRealtimeChannel, type RealtimeEvent } from '@/db/realtime-connection';

const payloadSchema = z.object({ terms: z.array(z.string()).max(5) });
type Payload = { terms: string[] };
export type KeywordDirectoryChangedEvent = RealtimeEvent<Payload>;
// Terms are filtered one by one so a single unexpected value cannot drop the rest of its batch.
export const subscribeToKeywordDirectoryChanged = createRealtimeChannel<Payload>(
    'keyword_directory_changed',
    data => {
        const parsed = payloadSchema.safeParse(data);
        const terms = parsed.success ? parsed.data.terms.filter(term => term.length > 0) : [];
        return terms.length ? { terms } : null;
    }
);
