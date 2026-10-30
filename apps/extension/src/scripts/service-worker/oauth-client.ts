import {
	type ChromeCredential,
	type ChromeOAuthProviderOptions,
	chromeCredentialSchema,
	createChromeOAuthProvider,
	InvalidGrant,
	pkceChallenge,
	randomOAuthValue,
} from "./oauth-provider";

interface ChromeOAuthOptions extends ChromeOAuthProviderOptions {
	launch: (url: string) => Promise<string>;
	read: () => Promise<unknown>;
	write: (credential: ChromeCredential) => Promise<void>;
	clear: () => Promise<void>;
}
export const createChromeOAuth = (options: ChromeOAuthOptions) => {
	const provider = createChromeOAuthProvider(options);
	const now = options.now ?? Date.now;
	let generation = 0;
	let signingIn = false;
	let refreshing: Promise<string | null> | null = null;
	let storageOperation = Promise.resolve();
	const store = (work: () => Promise<void>) => {
		const next = storageOperation.then(work, work);
		storageOperation = next.catch(() => undefined);
		return next;
	};
	const read = async () => {
		const parsed = chromeCredentialSchema.safeParse(await options.read());
		if (!parsed.success) {
			return null;
		}
		if (!provider.trusted(parsed.data)) {
			await store(options.clear);
			return null;
		}
		return parsed.data;
	};
	const save = async (credential: ChromeCredential, expected: number) => {
		if (generation !== expected) {
			await provider.revoke(credential).catch(() => undefined);
			return null;
		}
		try {
			await store(() =>
				generation === expected ? options.write(credential) : Promise.resolve()
			);
		} catch {
			await provider.revoke(credential).catch(() => undefined);
			throw new Error("Unable to protect extension sign-in.");
		}
		if (generation !== expected) {
			await provider.revoke(credential).catch(() => undefined);
			return null;
		}
		return credential.accessToken;
	};
	return {
		signIn: async () => {
			if (signingIn) {
				throw new Error("Sign-in is already in progress.");
			}
			signingIn = true;
			const expected = ++generation;
			try {
				const previous = await read();
				if (generation !== expected) {
					return;
				}
				await store(() =>
					generation === expected ? options.clear() : Promise.resolve()
				);
				if (previous) {
					await provider.revoke(previous).catch(() => undefined);
				}
				const context = await provider.register();
				const verifier = randomOAuthValue();
				const state = randomOAuthValue();
				const authorization = provider.authorizationUrl(
					context,
					state,
					await pkceChallenge(verifier)
				);
				if (generation !== expected) {
					return;
				}
				const code = provider.parseCallback(
					await options.launch(authorization),
					state
				);
				if (generation !== expected) {
					return;
				}
				const credential = await provider.exchange(context, {
					grant_type: "authorization_code",
					code,
					code_verifier: verifier,
					redirect_uri: options.redirectUri,
				});
				await save(credential, expected);
			} catch {
				throw new Error("Extension sign-in was not completed.");
			} finally {
				if (generation === expected) {
					signingIn = false;
				}
			}
		},
		getAccessToken: async (): Promise<string | null> => {
			if (signingIn) {
				return null;
			}
			const readGeneration = generation;
			const credential = await read();
			if (!credential || generation !== readGeneration || signingIn) {
				return null;
			}
			if (credential.expiresAt - now() > 60_000) {
				return credential.accessToken;
			}
			if (!refreshing) {
				const expected = generation;
				refreshing = provider
					.exchange(
						credential,
						{
							grant_type: "refresh_token",
							refresh_token: credential.refreshToken,
						},
						credential.refreshToken
					)
					.then((next) => save(next, expected))
					.catch(async (error) => {
						if (error instanceof InvalidGrant) {
							if (generation === expected) {
								await store(options.clear);
							}
							return null;
						}
						throw new Error("Extension sign-in is unavailable.");
					})
					.finally(() => {
						refreshing = null;
					});
			}
			return refreshing;
		},
		signOut: async () => {
			const expected = ++generation;
			signingIn = false;
			const credential = await read();
			if (generation !== expected) {
				return;
			}
			await store(() =>
				generation === expected ? options.clear() : Promise.resolve()
			);
			if (credential) {
				await provider.revoke(credential).catch(() => undefined);
			}
		},
	};
};
