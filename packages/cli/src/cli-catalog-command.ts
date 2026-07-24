import type { createRankWranglerClient } from '@rankwrangler/http-client';
import { parseIntegerOption } from './cli-options';

type CliFail = (code: string, message: string, details?: unknown) => never;

export const runCatalogCommand = async (
    command: {
        verb: string;
        args: string[];
    },
    client: ReturnType<typeof createRankWranglerClient>,
    options: {
        maxAgeSeconds?: string;
        limit?: string;
        cursor?: string;
    },
    fail: CliFail
): Promise<unknown> => {
    if (command.verb === 'search') {
        const term = command.args.join(' ').trim();
        if (!term) {
            fail('INVALID_INPUT', 'catalog search requires a term');
        }
        const maxAgeSeconds = parseIntegerOption(
            {
                value: options.maxAgeSeconds,
                optionName: 'maxAgeSeconds',
                min: 0,
                max: 7 * 24 * 60 * 60,
                defaultValue: 24 * 60 * 60,
            },
            fail
        );

        return await client.catalog.search.mutate({ term, maxAgeSeconds });
    }

    if (command.verb === 'query') {
        const term = command.args.join(' ').trim();
        if (!term) {
            fail('INVALID_INPUT', 'catalog query requires a term');
        }
        return await client.catalog.query.get.query({ term });
    }

    if (command.verb === 'track' || command.verb === 'untrack') {
        const term = command.args.join(' ').trim();
        if (!term) {
            fail('INVALID_INPUT', `catalog ${command.verb} requires a term`);
        }
        const procedure =
            command.verb === 'track' ? client.catalog.query.track : client.catalog.query.untrack;
        return await procedure.mutate({ term });
    }

    if (command.verb === 'run') {
        if (command.args.length !== 1) {
            fail('INVALID_INPUT', 'catalog run requires exactly one id');
        }
        return await client.catalog.run.get.query({ id: command.args[0] });
    }

    if (command.verb === 'runs') {
        if (command.args.length !== 1) {
            fail('INVALID_INPUT', 'catalog runs requires exactly one query id');
        }
        const limit = parseIntegerOption(
            {
                value: options.limit,
                optionName: 'limit',
                min: 1,
                max: 100,
                defaultValue: 20,
            },
            fail
        );
        return await client.catalog.run.list.query({
            queryId: command.args[0],
            limit,
            ...(options.cursor ? { cursor: options.cursor } : {}),
        });
    }

    fail('UNKNOWN_COMMAND', 'Unknown Catalog command', {
        command: `catalog ${command.verb}`,
    });
};
