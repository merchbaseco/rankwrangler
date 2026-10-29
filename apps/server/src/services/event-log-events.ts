import { z } from 'zod';
import { createRealtimeChannel, type RealtimeEvent } from '@/db/realtime-connection';

const payloadSchema = z.object({ accountId: z.string().min(1) });
export type EventLogCreatedEvent = RealtimeEvent<z.infer<typeof payloadSchema>>;
export const subscribeToEventLogCreated = createRealtimeChannel(
    'event_log_created',
    data => payloadSchema.safeParse(data).data ?? null
);
