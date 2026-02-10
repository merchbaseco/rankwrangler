import { parseArgs } from 'node:util';
import { createApiClient } from '@/api/client.js';

const DEFAULT_API_URL = process.env.RR_API_URL ?? 'http://localhost:8080';

const { positionals, values } = parseArgs({
    args: process.argv.slice(2),
    options: {
        marketplaceId: { type: 'string' },
        asin: { type: 'string' },
        token: { type: 'string' },
        url: { type: 'string' },
        pretty: { type: 'boolean' },
        help: { type: 'boolean' },
    },
    allowPositionals: true,
});

const command = positionals[0];

if (!command || values.help) {
    printUsage();
    process.exit(command ? 0 : 1);
}

if (command !== 'get-product-info') {
    console.error(`Unknown command: ${command}`);
    printUsage();
    process.exit(1);
}

const marketplaceId = values.marketplaceId ?? process.env.RR_MARKETPLACE_ID;
const asin = values.asin ?? process.env.RR_ASIN;
const token = values.token ?? process.env.RR_CLERK_TOKEN;
const apiUrl = values.url ?? DEFAULT_API_URL;

if (!marketplaceId || !asin) {
    console.error('Missing required inputs: marketplaceId and asin.');
    printUsage();
    process.exit(1);
}

if (!token) {
    console.error('Missing Clerk token. Provide --token or set RR_CLERK_TOKEN.');
    process.exit(1);
}

const client = createApiClient({ apiUrl, token });

try {
    const result = await client.public.getProductInfo.mutate({ marketplaceId, asin });
    const pretty = values.pretty ?? true;
    console.log(pretty ? JSON.stringify(result, null, 2) : JSON.stringify(result));
} catch (error) {
    console.error('CLI request failed:', error);
    process.exit(1);
}

function printUsage() {
    console.log('RankWrangler CLI');
    console.log('');
    console.log('Usage:');
    console.log('  bun run cli -- get-product-info --marketplaceId <id> --asin <asin>');
    console.log('');
    console.log('Options:');
    console.log('  --marketplaceId   Marketplace ID (or RR_MARKETPLACE_ID env var)');
    console.log('  --asin            ASIN (or RR_ASIN env var)');
    console.log('  --token           Clerk JWT (or RR_CLERK_TOKEN env var)');
    console.log(`  --url             API base URL (default: ${DEFAULT_API_URL})`);
    console.log('  --pretty          Pretty-print JSON (default: true)');
}
