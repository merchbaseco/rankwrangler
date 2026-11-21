import { env } from '@/config/env';
import {
    AutocompleteDeferred,
    deferAutocomplete,
    relaxAutocomplete,
    reserveAutocompleteCall,
    retryAfterMs,
    throttleAutocomplete,
} from '@/db/keyword-autocomplete-capacity';
import {
    fetchKeywordAutocompleteResponse,
    parseAutocompleteSuggestions,
} from './keyword-autocomplete-client';
import { captureProviderAttempt } from './providers/provider-telemetry';

const RELAY_REQUIRED_DEFER_MS = 3_600_000;

export const isAutocompleteRelayConfigured = () =>
    Boolean(env.RANKWRANGLER_AUTOCOMPLETE_RELAY_URL && env.RANKWRANGLER_AUTOCOMPLETE_RELAY_TOKEN);

export const fetchKeywordAutocomplete = async (seed: string) => {
    const url = env.RANKWRANGLER_AUTOCOMPLETE_RELAY_URL;
    const token = env.RANKWRANGLER_AUTOCOMPLETE_RELAY_TOKEN;
    // Fail closed: never send Amazon autocomplete traffic from the server's own IP.
    if (!url || !token) {
        throw new AutocompleteDeferred(new Date(Date.now() + RELAY_REQUIRED_DEFER_MS));
    }
    await reserveAutocompleteCall();
    const response = await captureProviderAttempt(
        { provider: 'amazonAutocomplete', operation: 'amazon.autocomplete' },
        () => fetchKeywordAutocompleteResponse(seed, { url, token })
    );
    if (response.status === 403) {
        const retryAt = new Date(Date.now() + 3_600_000);
        await deferAutocomplete(retryAt);
        throw new AutocompleteDeferred(retryAt);
    }
    if (response.status === 429 || response.status >= 500)
        throw new AutocompleteDeferred(
            await throttleAutocomplete(
                retryAfterMs(response.headers.get('retry-after')),
                new Date(),
                response.status
            )
        );
    if (!response.ok) throw new Error(`Autocomplete request failed (${response.status})`);
    await relaxAutocomplete();
    return parseAutocompleteSuggestions(seed, await response.json());
};
