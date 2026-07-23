import type { CreateWSSContextFnOptions } from '@trpc/server/adapters/ws';
import { createRequestContext } from '@/api/context';

const BEARER_PREFIX = 'Bearer ';

export const resolveWebSocketAuthorization = ({
    headerAuthorization,
    connectionParams,
}: {
    headerAuthorization?: string;
    connectionParams: unknown;
}) => {
    if (headerAuthorization?.startsWith(BEARER_PREFIX)) {
        return headerAuthorization;
    }

    const token = getConnectionToken(connectionParams);
    return token ? `${BEARER_PREFIX}${token}` : undefined;
};

export const createWebSocketContext = async ({ req, res, info }: CreateWSSContextFnOptions) => {
    const headerAuthorization = Array.isArray(req.headers.authorization)
        ? req.headers.authorization[0]
        : req.headers.authorization;

    const context = await createRequestContext({
        headers: {
            authorization: resolveWebSocketAuthorization({
                headerAuthorization,
                connectionParams: info.connectionParams,
            }),
            host: req.headers.host,
        },
    });
    if (context.authType === 'clerk' && context.authExpiresAtMs) {
        scheduleWebSocketCredentialExpiry({
            client: res,
            expiresAtMs: context.authExpiresAtMs,
        });
    }

    return context;
};

export const scheduleWebSocketCredentialExpiry = ({
    client,
    expiresAtMs,
    nowMs = Date.now(),
    setTimer = (listener, delayMs) => setTimeout(listener, delayMs),
    clearTimer = timer => clearTimeout(timer as ReturnType<typeof setTimeout>),
}: {
    client: {
        close: (code?: number, reason?: string) => void;
        once: (event: 'close', listener: () => void) => unknown;
    };
    expiresAtMs: number;
    nowMs?: number;
    setTimer?: (listener: () => void, delayMs: number) => unknown;
    clearTimer?: (timer: unknown) => void;
}) => {
    const timer = setTimer(
        () => client.close(4401, 'Clerk credential expired'),
        Math.max(0, expiresAtMs - nowMs)
    );
    client.once('close', () => clearTimer(timer));
};

const getConnectionToken = (connectionParams: unknown) => {
    if (!connectionParams || typeof connectionParams !== 'object') {
        return null;
    }

    const params = connectionParams as Record<string, unknown>;
    const rawToken = [params.Authorization, params.authorization, params.token].find(
        value => typeof value === 'string'
    );
    if (typeof rawToken !== 'string') {
        return null;
    }

    const token = rawToken.trim();
    if (!token) {
        return null;
    }

    return token.startsWith(BEARER_PREFIX) ? token.slice(BEARER_PREFIX.length).trim() : token;
};
