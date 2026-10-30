import { createCloudflareAccessRequest } from '@merchbaseco/access';
import type { FastifyInstance } from 'fastify';
import { accessDelegationAudit } from '@/db/access-delegation-audit-schema';
import type { Database } from '@/db/index';
import type { RankWranglerServicePrincipal } from './rankwrangler-access';

export const INTERNAL_HOST = 'rankwrangler-internal.merchbase.co';
export const INTERNAL_PRODUCT_PATH = '/api/api.public.product.getMany';
export const INTERNAL_PRODUCT_ROUTE = `POST ${INTERNAL_PRODUCT_PATH}`;

export const registerInternalRouteBoundary = (fastify: FastifyInstance) => {
    fastify.addHook('onRequest', (request, reply, done) => {
        if (request.headers.host !== INTERNAL_HOST) {
            done();
            return;
        }
        if (
            request.method === 'POST' &&
            (request.raw.url === INTERNAL_PRODUCT_PATH ||
                request.raw.url === '/api/internal/access-snapshot')
        ) {
            done();
            return;
        }
        reply.code(404).send();
    });
};

export const createInternalAccess = (
    options: Omit<
        Parameters<typeof createCloudflareAccessRequest<RankWranglerServicePrincipal>>[0],
        'allowedCallers' | 'machines' | 'audit'
    > & {
        bidbeaconClientId: string;
        database: Database;
        grantDeadline: (uid: string) => Promise<number | null>;
    }
) =>
    createCloudflareAccessRequest({
        ...options,
        access: {
            ...options.access,
            evaluateAccess: async uid => {
                await options.grantDeadline(uid);
                return options.access.evaluateAccess(uid);
            },
        },
        machines: [{ clientId: options.bidbeaconClientId, service: 'bidbeacon' }],
        allowedCallers: { bidbeacon: [INTERNAL_PRODUCT_ROUTE] },
        audit: async record => {
            await options.database.insert(accessDelegationAudit).values({
                caller: record.caller,
                receiver: record.service,
                merchbaseUserId: record.merchbaseUserId,
                route: record.route,
                outcome: record.outcome,
            });
        },
    });
