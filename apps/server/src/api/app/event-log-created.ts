import { observable } from '@trpc/server/observable';
import { appProcedure } from '@/api/trpc';
import { type EventLogCreatedEvent, subscribeToEventLogCreated } from '@/services/event-log-events';

export const eventLogCreated = appProcedure.subscription(() =>
    observable<EventLogCreatedEvent>(emit => subscribeToEventLogCreated(event => emit.next(event)))
);
