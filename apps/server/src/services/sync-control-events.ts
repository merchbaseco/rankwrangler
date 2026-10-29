import { z } from 'zod';
import { createRealtimeChannel, type RealtimeEvent } from '@/db/realtime-connection';

const payloadSchema = z.object({ controlId: z.literal(1) });
export type SyncControlChangedEvent = RealtimeEvent<z.infer<typeof payloadSchema>>;
export const subscribeToSyncControlChanged = createRealtimeChannel(
    'sync_control_changed',
    data => payloadSchema.safeParse(data).data ?? null
);
