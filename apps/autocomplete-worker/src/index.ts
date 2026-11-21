/**
 * Minimal Cloudflare Worker relay for Amazon US desktop autocomplete suggestions.
 * Keeps automated storefront requests off the RankWrangler server's local IP while
 * restricting outbound requests strictly to `https://www.amazon.com/suggestions`.
 */

interface WorkerEnv {
    AUTOCOMPLETE_RELAY_TOKEN?: string;
}

const AMAZON_SUGGESTIONS_URL = 'https://www.amazon.com/suggestions';
const MAX_PREFIX_LENGTH = 200;

const BROWSER_HEADERS: Readonly<Record<string, string>> = {
    'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    Accept: 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: 'https://www.amazon.com/',
    Origin: 'https://www.amazon.com',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'X-Requested-With': 'XMLHttpRequest',
};

const timingSafeEqual = (a: string, b: string): boolean => {
    const encoder = new TextEncoder();
    const left = encoder.encode(a);
    const right = encoder.encode(b);
    if (left.length !== right.length) return false;
    let diff = 0;
    for (let i = 0; i < left.length; i++) {
        diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
    }
    return diff === 0;
};

const isAuthorized = (request: Request, expectedToken: string | undefined): boolean => {
    if (!expectedToken) return false;
    const header = request.headers.get('authorization');
    if (!header?.startsWith('Bearer ')) return false;
    return timingSafeEqual(header.slice('Bearer '.length), expectedToken);
};

const buildAmazonUrl = (prefix: string): string => {
    const url = new URL(AMAZON_SUGGESTIONS_URL);
    url.search = new URLSearchParams([
        ['limit', '11'],
        ['prefix', prefix],
        ['suggestion-type', 'WIDGET'],
        ['suggestion-type', 'KEYWORD'],
        ['alias', 'aps'],
        ['site-variant', 'desktop'],
        ['version', '3'],
        ['lop', 'en_US'],
        ['fb', '1'],
        ['mid', 'ATVPDKIKX0DER'],
    ]).toString();
    return url.toString();
};

export default {
    async fetch(request: Request, env: WorkerEnv): Promise<Response> {
        const url = new URL(request.url);
        if (request.method === 'GET' && url.pathname === '/health') {
            return Response.json({ ok: true });
        }
        if (request.method !== 'GET' || url.pathname !== '/suggestions') {
            return new Response('Not found', { status: 404 });
        }
        if (!isAuthorized(request, env.AUTOCOMPLETE_RELAY_TOKEN)) {
            return new Response('Unauthorized', { status: 401 });
        }
        const prefix = url.searchParams.get('prefix')?.trim() ?? '';
        if (!prefix || prefix.length > MAX_PREFIX_LENGTH) {
            return new Response('Invalid prefix', { status: 400 });
        }

        const upstream = await fetch(buildAmazonUrl(prefix), {
            headers: BROWSER_HEADERS,
        });
        const headers = new Headers();
        const contentType = upstream.headers.get('content-type');
        if (contentType) headers.set('content-type', contentType);
        const retryAfter = upstream.headers.get('retry-after');
        if (retryAfter) headers.set('retry-after', retryAfter);
        headers.set('cache-control', 'no-store');

        return new Response(upstream.body, {
            status: upstream.status,
            headers,
        });
    },
};
