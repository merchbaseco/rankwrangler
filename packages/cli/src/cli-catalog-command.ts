import type { createRankWranglerClient } from '@rankwrangler/http-client';
import { parseIntegerOption } from './cli-options';

type CliFail = (code: string, message: string, details?: unknown) => never;

export const runCatalogCommand = async (
    command: {
        verb: string;
        args: string[];
    },
    client: ReturnType<typeof createRankWranglerClient>,
    maxAgeSecondsValue: string | undefined,
    fail: CliFail
): Promise<unknown> => {
    if (command.verb === 'search') {
        const term = command.args.join(' ').trim();
        if (!term) {
            fail('INVALID_INPUT', 'catalog search requires a term');
        }
        const maxAgeSeconds = parseIntegerOption(
            {
                value: maxAgeSecondsValue,
                optionName: 'maxAgeSeconds',
                min: 0,
                max: 7 * 24 * 60 * 60,
                defaultValue: 24 * 60 * 60,
            },
            fail
        );

        return await client.catalog.search.mutate({ term, maxAgeSeconds });
    }

    if (command.verb === 'run') {
        if (command.args.length !== 1) {
            fail('INVALID_INPUT', 'catalog run requires exactly one id');
        }
        return await client.catalog.run.get.query({ id: command.args[0] });
    }

    fail('UNKNOWN_COMMAND', 'Unknown Catalog command', {
        command: `catalog ${command.verb}`,
    });
};
