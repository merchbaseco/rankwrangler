import postgres from 'postgres';
import { createDatabaseConnectionOptions } from '@/config/database-connection';
import { env } from '@/config/env';

export type RealtimeEvent<T> = { kind: 'changed'; data: T } | { kind: 'resync' };
type Channel = { notify: (payload: string) => void; ready: () => void };
const channels = new Map<string, Channel>();
const listened = new Set<string>();
let generation = 0;
let failures = 0;
let listening: Promise<void> | undefined;
let retry: ReturnType<typeof setTimeout> | undefined;
let closing = false;

// LISTEN needs one session connection, not the transaction pool. This module owns its lifecycle:
// postgres.js re-runs its own listen() only once after a drop and swallows that failure, which
// would silently end delivery. Here every close re-LISTENs with backoff until it succeeds, and each
// successful LISTEN publishes a resync so subscribers reconcile anything missed while down.
export const realtimeConnection = postgres({
    ...createDatabaseConnectionOptions(env, 'direct'),
    connection: { TimeZone: 'UTC', application_name: 'rankwrangler-realtime' },
    max: 1,
    // Zero disables both timers: a recycled session would drop every LISTEN.
    idle_timeout: 0,
    max_lifetime: 0,
    onclose: () => {
        generation += 1;
        listened.clear();
        if (!closing && channels.size) scheduleListen(0);
    },
    // Supported at runtime (postgres.js routes it to every connection) but absent from its types.
    ...({ onnotify: (name: string, payload: string) => channels.get(name)?.notify(payload) } as {}),
});

export const closeRealtimeConnection = async () => {
    closing = true;
    if (retry) clearTimeout(retry);
    await realtimeConnection.end({ timeout: 5 });
};

export const createRealtimeChannel = <T>(name: string, parse: (payload: unknown) => T | null) => {
    const listeners = new Set<(event: RealtimeEvent<T>) => void>();
    const publish = (event: RealtimeEvent<T>) => {
        for (const listener of listeners) {
            try {
                listener(event);
            } catch (error) {
                console.error(`[Realtime ${name}] Listener failed`, error);
            }
        }
    };
    return (listener: (event: RealtimeEvent<T>) => void) => {
        if (!channels.has(name))
            channels.set(name, {
                notify: payload => {
                    let data: T | null = null;
                    try {
                        data = parse(JSON.parse(payload));
                    } catch {
                        return;
                    }
                    if (data !== null) publish({ kind: 'changed', data });
                },
                ready: () => publish({ kind: 'resync' }),
            });
        listeners.add(listener);
        // A ready channel reconciles this subscriber now; otherwise its LISTEN will resync everyone.
        if (listened.has(name)) listener({ kind: 'resync' });
        else scheduleListen(0);
        return () => {
            listeners.delete(listener);
        };
    };
};

const scheduleListen = (delayMs: number) => {
    if (closing || retry) return;
    retry = setTimeout(() => {
        retry = undefined;
        listening ??= listenAll()
            .then(() => {
                failures = 0;
                if ([...channels.keys()].some(name => !listened.has(name))) scheduleListen(0);
            })
            .catch(error => {
                failures += 1;
                console.error('[Realtime] LISTEN failed; retrying', error);
                scheduleListen(Math.min(30_000, 1000 * 2 ** Math.min(failures, 5)));
            })
            .finally(() => {
                listening = undefined;
            });
    }, delayMs);
};

const listenAll = async () => {
    const session = generation;
    for (const [name, channel] of channels) {
        if (listened.has(name)) continue;
        await realtimeConnection.unsafe(`listen "${name.replaceAll('"', '""')}"`);
        if (session !== generation) return scheduleListen(0);
        listened.add(name);
        channel.ready();
    }
};
