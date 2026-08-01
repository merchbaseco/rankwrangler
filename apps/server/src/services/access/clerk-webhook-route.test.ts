import { describe, expect, it } from 'bun:test';
import { createHmac } from 'node:crypto';
import type { AccessProjectionEvent } from '@merchbaseco/access';
import Fastify from 'fastify';
import { registerClerkAccessWebhookRoute } from './clerk-webhook-route';

const signingSecret = `whsec_${Buffer.from('testsecret').toString('base64')}`;
const issuer = 'https://clerk.test';

describe('Clerk access webhook route', () => {
    it('preserves the raw body and commits signed projection updates', async () => {
        const events: AccessProjectionEvent[] = [];
        const app = Fastify({ logger: false });
        await registerClerkAccessWebhookRoute(app, {
            issuer,
            signingSecret,
            store: createStore(event => events.push(event)),
        });

        const response = await app.inject({
            method: 'POST',
            url: '/api/webhooks/clerk/access',
            headers: signedHeaders(updatePayload),
            payload: JSON.stringify(updatePayload),
        });

        expect(response.statusCode).toBe(204);
        expect(events).toEqual([
            {
                eventId: 'msg_rankwrangler_test',
                projection: {
                    access: 'granted',
                    accessValidUntil: Date.parse('2026-08-29T16:00:00.000Z'),
                    issuer,
                    merchbaseUserId: 'mbu_webhook_test',
                    sourceUpdatedAt: 2000,
                    subject: 'user_webhook_test',
                },
                type: 'upsert',
            },
        ]);
        await app.close();
    });

    it('turns signed deletion events into terminal tombstones and rejects unsigned input', async () => {
        const events: AccessProjectionEvent[] = [];
        const app = Fastify({ logger: false });
        await registerClerkAccessWebhookRoute(app, {
            issuer,
            signingSecret,
            store: createStore(event => events.push(event)),
        });

        const unsigned = await app.inject({
            method: 'POST',
            url: '/api/webhooks/clerk/access',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify(updatePayload),
        });
        expect(unsigned.statusCode).toBe(400);
        expect(events).toHaveLength(0);

        const deletedPayload = {
            data: { deleted: true, id: 'user_webhook_test', object: 'user' },
            object: 'event',
            type: 'user.deleted',
        };
        const deleted = await app.inject({
            method: 'POST',
            url: '/api/webhooks/clerk/access',
            headers: signedHeaders(deletedPayload),
            payload: JSON.stringify(deletedPayload),
        });

        expect(deleted.statusCode).toBe(204);
        expect(events).toEqual([
            {
                eventId: 'msg_rankwrangler_test',
                identity: { issuer, subject: 'user_webhook_test' },
                sourceUpdatedAt: Number.MAX_SAFE_INTEGER,
                type: 'remove',
            },
        ]);
        await app.close();
    });
});

const updatePayload = {
    data: {
        id: 'user_webhook_test',
        object: 'user',
        public_metadata: {
            merchbase: {
                access: 'granted',
                accessValidUntil: '2026-08-29T16:00:00.000Z',
                userId: 'mbu_webhook_test',
            },
        },
        updated_at: 2000,
    },
    object: 'event',
    type: 'user.updated',
};

const createStore = (apply: (event: AccessProjectionEvent) => void) => ({
    apply: async (event: AccessProjectionEvent) => apply(event),
    findByIdentity: async () => ({ type: 'missing' as const }),
    findByMerchbaseUserId: async () => null,
});

const signedHeaders = (payload: unknown) => {
    const body = JSON.stringify(payload);
    const id = 'msg_rankwrangler_test';
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac('sha256', Buffer.from('testsecret'))
        .update(`${id}.${timestamp}.${body}`)
        .digest('base64');
    return {
        'content-type': 'application/json',
        'svix-id': id,
        'svix-signature': `v1,${signature}`,
        'svix-timestamp': timestamp,
    };
};
