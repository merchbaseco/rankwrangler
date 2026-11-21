import {
    fetchKeywordAutocompleteResponse,
    parseAutocompleteSuggestions,
} from '@/services/keyword-autocomplete-client';

const defaultSeeds = ['teacher shirt', 'pickleball dad', 'funny cat hoodie'];

const run = async () => {
    const url = process.env.RANKWRANGLER_AUTOCOMPLETE_RELAY_URL?.trim();
    const token = process.env.RANKWRANGLER_AUTOCOMPLETE_RELAY_TOKEN?.trim();
    if (!url || !token) {
        console.error(
            'Set RANKWRANGLER_AUTOCOMPLETE_RELAY_URL and RANKWRANGLER_AUTOCOMPLETE_RELAY_TOKEN to test the relay.'
        );
        process.exit(1);
    }

    const cliSeeds = process.argv.slice(2).filter(arg => !arg.startsWith('-'));
    const seeds = cliSeeds.length > 0 ? cliSeeds : defaultSeeds;

    console.log(`Testing Amazon autocomplete via ${new URL(url).origin}`);
    let failures = 0;

    for (const seed of seeds) {
        const startedAt = Date.now();
        try {
            const response = await fetchKeywordAutocompleteResponse(seed, { url, token });
            const latencyMs = Date.now() - startedAt;
            if (!response.ok) {
                failures++;
                const snippet = (await response.text()).slice(0, 160).replace(/\s+/g, ' ');
                console.log(
                    `  ✗ "${seed}" -> HTTP ${response.status} (${latencyMs}ms): ${snippet}`
                );
                continue;
            }
            const suggestions = parseAutocompleteSuggestions(seed, await response.json());
            console.log(
                `  ✓ "${seed}" -> HTTP ${response.status} (${latencyMs}ms, ${suggestions.length} suggestions): ${suggestions.slice(0, 5).join(', ')}`
            );
        } catch (error) {
            failures++;
            const message = error instanceof Error ? error.message : String(error);
            console.log(`  ✗ "${seed}" -> error (${Date.now() - startedAt}ms): ${message}`);
        }
    }

    if (failures > 0) {
        process.exit(1);
    }
};

run().catch(error => {
    console.error('[Autocomplete Relay Smoke] Failed:', error);
    process.exit(1);
});
