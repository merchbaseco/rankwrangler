export interface ClerkSessionTokenSource {
	getToken: (options?: {
		organizationId?: string;
		skipCache?: boolean;
		template?: string;
	}) => Promise<string | null>;
}

interface CachedToken {
	expiresAt: number;
	session: ClerkSessionTokenSource;
	token: string;
}

interface InFlightRequest {
	promise: Promise<string | null>;
	session: ClerkSessionTokenSource;
}

export const TOKEN_REFRESH_SKEW_SECONDS = 5;

export const readJwtExpiry = (token: string): number | null => {
	const encodedPayload = token.split(".")[1];
	if (!encodedPayload) {
		return null;
	}

	try {
		const base64Payload = encodedPayload
			.replaceAll("-", "+")
			.replaceAll("_", "/")
			.padEnd(Math.ceil(encodedPayload.length / 4) * 4, "=");
		const binaryPayload = atob(base64Payload);
		const bytes = Uint8Array.from(binaryPayload, (character) =>
			character.charCodeAt(0)
		);
		const { exp } = JSON.parse(new TextDecoder().decode(bytes)) as {
			exp?: unknown;
		};

		return typeof exp === "number" && Number.isFinite(exp) && exp > 0
			? exp
			: null;
	} catch {
		return null;
	}
};

export const createClerkTokenProvider = (now: () => number = Date.now) => {
	let activeSession: ClerkSessionTokenSource | null = null;
	let cachedToken: CachedToken | null = null;
	let inFlightRequest: InFlightRequest | null = null;

	const clear = () => {
		activeSession = null;
		cachedToken = null;
		inFlightRequest = null;
	};

	const getToken = (
		session: ClerkSessionTokenSource
	): Promise<string | null> => {
		if (activeSession !== session) {
			activeSession = session;
			cachedToken = null;
		}

		const nowInSeconds = now() / 1000;
		if (
			cachedToken?.session === session &&
			cachedToken.expiresAt - nowInSeconds > TOKEN_REFRESH_SKEW_SECONDS
		) {
			return Promise.resolve(cachedToken.token);
		}

		if (inFlightRequest?.session === session) {
			return inFlightRequest.promise;
		}

		const promise = refreshToken(session);
		inFlightRequest = { promise, session };
		promise.then(
			() => clearInFlightRequest(promise),
			() => clearInFlightRequest(promise)
		);
		return promise;
	};

	const refreshToken = async (
		session: ClerkSessionTokenSource
	): Promise<string | null> => {
		const token = await session.getToken({ skipCache: true });
		if (!token) {
			if (activeSession === session) {
				cachedToken = null;
			}
			return null;
		}

		const expiresAt = readJwtExpiry(token);
		if (
			activeSession === session &&
			expiresAt !== null &&
			expiresAt - now() / 1000 > TOKEN_REFRESH_SKEW_SECONDS
		) {
			cachedToken = { expiresAt, session, token };
		} else if (activeSession === session) {
			cachedToken = null;
		}

		return token;
	};

	const clearInFlightRequest = (promise: Promise<string | null>) => {
		if (inFlightRequest?.promise === promise) {
			inFlightRequest = null;
		}
	};

	return { clear, getToken };
};
