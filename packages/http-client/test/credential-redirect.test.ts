import { expect, test } from 'bun:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createRankWranglerClient } from '../src/index';
import { productSearchInput } from './public-client.contract';

const wire = 'mbk_v1.eyJjbGllbnRJZCI6ImNsaWVudC5hY2Nlc3MiLCJjbGllbnRTZWNyZXQiOiJhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhIn0';
for (const batch of [true, false]) test(`native machine credentials cannot follow a cross-origin redirect (batch=${batch})`, async () => {
    let leaked = false;
    const receiver = createServer((_req, res) => { leaked = true; res.writeHead(200).end('{}'); });
    receiver.listen(0,'127.0.0.1'); await once(receiver,'listening');
    const receiverAddress = receiver.address();
    if (!receiverAddress || typeof receiverAddress==='string') throw new Error('Expected local TCP receiver');
    let receivedSecret: string | string[] | undefined;
    const origin = createServer((req,res) => {
        receivedSecret = req.headers['cf-access-client-secret'];
        res.writeHead(302,{ location: `http://127.0.0.1:${receiverAddress.port}/redirected` }).end();
    });
    origin.listen(0,'127.0.0.1'); await once(origin,'listening');
    const address = origin.address(); if (!address || typeof address==='string') throw new Error('Expected local TCP origin');
    try {
        const client = createRankWranglerClient({ baseUrl:`http://127.0.0.1:${address.port}`,apiKey:wire,batch });
        await expect(client.product.search.query(productSearchInput)).rejects.toThrow();
        expect(receivedSecret).toBe('a'.repeat(64));
        expect(leaked).toBe(false);
    } finally {
        origin.closeAllConnections(); receiver.closeAllConnections();
        await Promise.all([new Promise<void>(resolve=>origin.close(()=>resolve())),new Promise<void>(resolve=>receiver.close(()=>resolve()))]);
    }
});
