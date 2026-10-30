import type { FastifyInstance } from 'fastify';
import { runInteractive } from '@/db/index';

/** API and MCP requests read on the interactive pool (see `runInteractive`). */
export const registerInteractiveRequests = (
    fastify: FastifyInstance,
    run: (work: () => void) => void = runInteractive
) => {
    fastify.addHook('onRequest', (request, _reply, done) => {
        if (isInteractivePath(request.url)) run(done);
        else done();
    });
};

const isInteractivePath = (url: string) => url.startsWith('/api/') || url.startsWith('/mcp');
