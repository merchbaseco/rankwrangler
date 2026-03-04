import { env } from '@/config/env.js';
import {
    createSpApiHttpError,
    runWithSpApiBackoff,
} from '@/services/spapi/spapi-backoff.js';

type SpApiClientWithAccessTokenSetter = {
    applyXAmzAccessTokenToRequest: (accessToken: string) => unknown;
};

type SpApiAccessTokenPayload = {
    accessToken: string;
    expiresAtMs: number;
};

const LWA_ACCESS_TOKEN_URL = 'https://api.amazon.com/auth/o2/token';
const LWA_ACCESS_TOKEN_TIMEOUT_MS = 15_000;
const LWA_ACCESS_TOKEN_EXPIRY_BUFFER_MS = 60_000;

let cachedSpApiAccessToken: SpApiAccessTokenPayload | null = null;

export const ensureAccessTokenFreshness = async (
    client: SpApiClientWithAccessTokenSetter
) => {
    const accessToken = await getSpApiAccessToken();
    client.applyXAmzAccessTokenToRequest(accessToken);
};

const getSpApiAccessToken = async () => {
    if (
        cachedSpApiAccessToken &&
        cachedSpApiAccessToken.expiresAtMs - LWA_ACCESS_TOKEN_EXPIRY_BUFFER_MS >
            Date.now()
    ) {
        return cachedSpApiAccessToken.accessToken;
    }

    const refreshedToken = await runWithSpApiBackoff({
        operation: 'retrieve LWA access token',
        run: async () => await fetchLwaAccessToken(),
    });
    cachedSpApiAccessToken = refreshedToken;
    return refreshedToken.accessToken;
};

const fetchLwaAccessToken = async (): Promise<SpApiAccessTokenPayload> => {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), LWA_ACCESS_TOKEN_TIMEOUT_MS);

    try {
        const response = await fetch(LWA_ACCESS_TOKEN_URL, {
            body: new URLSearchParams({
                client_id: env.SPAPI_CLIENT_ID,
                client_secret: env.SPAPI_APP_CLIENT_SECRET,
                grant_type: 'refresh_token',
                refresh_token: env.SPAPI_REFRESH_TOKEN,
            }),
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
            },
            method: 'POST',
            signal: controller.signal,
        });

        if (!response.ok) {
            throw createSpApiHttpError(
                `LWA access token request failed with status ${response.status}.`,
                response.status
            );
        }

        const payload = await response.json();
        const accessToken = getAccessTokenFromPayload(payload);
        const expiresInSeconds = getExpiresInSecondsFromPayload(payload);

        return {
            accessToken,
            expiresAtMs: Date.now() + expiresInSeconds * 1000,
        };
    } catch (error) {
        if (isAbortError(error)) {
            throw new Error(
                `LWA access token request timed out after ${LWA_ACCESS_TOKEN_TIMEOUT_MS}ms.`
            );
        }

        throw error;
    } finally {
        clearTimeout(timeoutHandle);
    }
};

const getAccessTokenFromPayload = (payload: unknown) => {
    if (!isRecord(payload) || typeof payload.access_token !== 'string') {
        throw new Error('LWA access token response did not include access_token.');
    }

    return payload.access_token;
};

const getExpiresInSecondsFromPayload = (payload: unknown) => {
    if (!isRecord(payload)) {
        throw new Error('LWA access token response did not include expires_in.');
    }

    const expiresInRaw = payload.expires_in;
    const expiresInSeconds =
        typeof expiresInRaw === 'number' ? expiresInRaw : Number(expiresInRaw);

    if (!Number.isFinite(expiresInSeconds) || expiresInSeconds <= 0) {
        throw new Error('LWA access token response included invalid expires_in.');
    }

    return expiresInSeconds;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null;
};

const isAbortError = (error: unknown) => {
    return (
        error instanceof Error &&
        (error.name === 'AbortError' || error.message.toLowerCase().includes('aborted'))
    );
};
