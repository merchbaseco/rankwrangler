import type { CreateWSSContextFnOptions } from '@trpc/server/adapters/ws';
import { type ContextRequest, createRequestContext } from '@/api/context';
import type { RankWranglerAccess } from '@/services/access/rankwrangler-access';

export const createWebSocketContext = async (
    { req, res }: CreateWSSContextFnOptions,
    access: Pick<RankWranglerAccess, 'authorizeRequest' | 'grantDeadline'> | null,
    onAuthenticated?: (uid: string) => void
) => {
    const request: ContextRequest = {
        headers: {
            host: req.headers.host,
            'cf-access-jwt-assertion':
                typeof req.headers['cf-access-jwt-assertion'] === 'string'
                    ? req.headers['cf-access-jwt-assertion']
                    : undefined,
            'x-merchbase-user-id': req.headers['x-merchbase-user-id'],
        },
    };
    const context = await createRequestContext(request, access);
    if (context.authType === 'access' && context.accessPrincipal && access) {
        onAuthenticated?.(context.accessPrincipal.merchbaseUserId);
        try {
            const grantDeadline = await access.grantDeadline(
                context.accessPrincipal.merchbaseUserId
            );
            const deadline = Math.min(
                context.authExpiresAtMs ?? Number.POSITIVE_INFINITY,
                grantDeadline ?? Number.POSITIVE_INFINITY
            );
            if (Number.isFinite(deadline)) {
                scheduleWebSocketCredentialExpiry({ client: res, expiresAtMs: deadline });
            }
        } catch (error) {
            res.close(4403, 'Access revoked');
            throw error;
        }
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
        () => client.close(4401, 'Access credential expired'),
        Math.max(0, expiresAtMs - nowMs)
    );
    client.once('close', () => clearTimer(timer));
};
