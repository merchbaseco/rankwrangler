import { z } from 'zod';
import { createRealtimeChannel, type RealtimeEvent } from '@/db/realtime-connection';

const payloadSchema = z.object({ jobName: z.string().min(1) });
export type JobActivityEvent = RealtimeEvent<z.infer<typeof payloadSchema>>;
export const subscribeToJobActivity = createRealtimeChannel(
    'job_activity',
    data => payloadSchema.safeParse(data).data ?? null
);
