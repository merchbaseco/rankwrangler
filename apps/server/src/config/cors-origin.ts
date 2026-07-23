const deployedWebOrigins = new Set([
    'https://merchbase.co',
    'https://rankwrangler.merchbase.co',
]);

const extensionOriginPrefixes = ['safari-web-extension://', 'chrome-extension://'];
const loopbackHostnames = new Set(['localhost', '127.0.0.1', '[::1]']);

type CorsOriginCallback = (error: Error | null, allowed: boolean) => void;

type CorsOriginOptions = {
    isProduction: boolean;
};

export const createCorsOriginHandler = ({ isProduction }: CorsOriginOptions) => {
    return (origin: string | undefined, callback: CorsOriginCallback): void => {
        if (isCorsOriginAllowed(origin, isProduction)) {
            callback(null, true);
            return;
        }

        callback(new Error('Not allowed by CORS'), false);
    };
};

const isCorsOriginAllowed = (origin: string | undefined, isProduction: boolean): boolean => {
    if (!origin) {
        return true;
    }

    if (
        deployedWebOrigins.has(origin) ||
        extensionOriginPrefixes.some((prefix) => origin.startsWith(prefix))
    ) {
        return true;
    }

    return !isProduction && isHttpLoopbackOrigin(origin);
};

const isHttpLoopbackOrigin = (origin: string): boolean => {
    try {
        const url = new URL(origin);
        return url.protocol === 'http:' && loopbackHostnames.has(url.hostname);
    } catch {
        return false;
    }
};
