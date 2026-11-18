const deployedWebOrigins = new Set(['https://merchbase.co', 'https://rankwrangler.merchbase.co']);

const loopbackHostnames = new Set(['localhost', '127.0.0.1', '[::1]']);

export const isDashboardWebOrigin = (origin: string, isProduction: boolean): boolean => {
    if (deployedWebOrigins.has(origin)) {
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
