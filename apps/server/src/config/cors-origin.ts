import { isDashboardWebOrigin } from './dashboard-origin';

// Safari Web Extensions get a per-install-generated origin UUID, not a
// key-derived one, so unlike Chrome it cannot be pinned to an exact origin.
const safariExtensionOriginPrefix = 'safari-web-extension://';

type CorsOriginCallback = (error: Error | null, allowed: boolean) => void;

type CorsOriginOptions = {
    isProduction: boolean;
    allowedChromeExtensionIds: readonly string[];
};

export const createCorsOriginHandler = ({
    isProduction,
    allowedChromeExtensionIds,
}: CorsOriginOptions) => {
    const allowedChromeExtensionOrigins = new Set(
        allowedChromeExtensionIds.map((id) => `chrome-extension://${id}`)
    );

    return (origin: string | undefined, callback: CorsOriginCallback): void => {
        if (isCorsOriginAllowed(origin, isProduction, allowedChromeExtensionOrigins)) {
            callback(null, true);
            return;
        }

        callback(new Error('Not allowed by CORS'), false);
    };
};

const isCorsOriginAllowed = (
    origin: string | undefined,
    isProduction: boolean,
    allowedChromeExtensionOrigins: ReadonlySet<string>
): boolean => {
    if (!origin) {
        return true;
    }

    if (
        allowedChromeExtensionOrigins.has(origin) ||
        origin.startsWith(safariExtensionOriginPrefix) ||
        isDashboardWebOrigin(origin, isProduction)
    ) {
        return true;
    }

    return false;
};
