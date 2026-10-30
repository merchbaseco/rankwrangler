import { z } from "zod";

const endpoint = z.string().url();
const metadataSchema = z.object({
	issuer: endpoint,
	authorization_endpoint: endpoint,
	token_endpoint: endpoint,
	registration_endpoint: endpoint,
	revocation_endpoint: endpoint,
	code_challenge_methods_supported: z.array(z.string()),
});
export const chromeCredentialSchema = z.object({
	accessToken: z.string().min(1),
	refreshToken: z.string().min(1),
	expiresAt: z.number().int().positive(),
	clientId: z.string().min(1),
	issuer: endpoint,
	resource: endpoint,
	tokenEndpoint: endpoint,
	revocationEndpoint: endpoint,
});
export type ChromeCredential = z.infer<typeof chromeCredentialSchema>;
const challengePattern = /resource_metadata="([^"]+)"/;
const paddingPattern = /=+$/;
const plusPattern = /\+/g;
const slashPattern = /\//g;
type Context = Omit<
	ChromeCredential,
	"accessToken" | "refreshToken" | "expiresAt"
>;
export interface ChromeOAuthProviderOptions {
	issuer: string;
	resource: string;
	redirectUri: string;
	fetch: typeof fetch;
	now?: () => number;
}
export class InvalidGrant extends Error {}

export const createChromeOAuthProvider = (
	options: ChromeOAuthProviderOptions
) => {
	const issuer = new URL(options.issuer);
	const resource = new URL(options.resource);
	const redirect = new URL(options.redirectUri);
	if (
		issuer.origin !== options.issuer ||
		issuer.protocol !== "https:" ||
		!issuer.hostname.endsWith(".cloudflareaccess.com") ||
		resource.protocol !== "https:" ||
		resource.username ||
		resource.password ||
		resource.search ||
		resource.hash ||
		redirect.protocol !== "https:" ||
		!redirect.hostname.endsWith(".chromiumapp.org") ||
		redirect.username ||
		redirect.password ||
		redirect.search ||
		redirect.hash
	) {
		throw new Error("Invalid extension sign-in configuration.");
	}
	const now = options.now ?? Date.now;
	const request = (url: string, init: RequestInit = {}) =>
		options.fetch(url, {
			...init,
			redirect: "manual",
			signal: AbortSignal.timeout(15_000),
		});
	const json = async (
		url: string,
		init: RequestInit = {}
	): Promise<unknown> => {
		const response = await request(url, init);
		if (!response.ok) {
			throw new Error("Extension sign-in is unavailable.");
		}
		return response.json();
	};
	const trustedEndpoint = (value: string) => {
		const url = new URL(value);
		return (
			url.origin === options.issuer &&
			!url.username &&
			!url.password &&
			!url.search &&
			!url.hash
		);
	};
	return {
		trusted: (credential: ChromeCredential) =>
			credential.issuer === options.issuer &&
			credential.resource === options.resource &&
			trustedEndpoint(credential.tokenEndpoint) &&
			trustedEndpoint(credential.revocationEndpoint),
		register: async () => {
			const challenge = await request(options.resource);
			const location = challenge.headers
				.get("www-authenticate")
				?.match(challengePattern)?.[1];
			if (
				challenge.status !== 401 ||
				!location ||
				new URL(location).origin !== resource.origin
			) {
				throw new Error("Invalid extension sign-in discovery.");
			}
			const protectedResource = z
				.object({
					resource: endpoint,
					authorization_servers: z.array(endpoint),
				})
				.parse(await json(location));
			if (
				protectedResource.resource !== options.resource ||
				!protectedResource.authorization_servers.includes(options.issuer)
			) {
				throw new Error("Invalid extension sign-in discovery.");
			}
			const metadata = metadataSchema.parse(
				await json(`${options.issuer}/.well-known/oauth-authorization-server`)
			);
			if (
				metadata.issuer !== options.issuer ||
				!metadata.code_challenge_methods_supported.includes("S256") ||
				![
					metadata.authorization_endpoint,
					metadata.token_endpoint,
					metadata.registration_endpoint,
					metadata.revocation_endpoint,
				].every(trustedEndpoint)
			) {
				throw new Error("Invalid extension sign-in discovery.");
			}
			const client = z.object({ client_id: z.string().min(1) }).parse(
				await json(metadata.registration_endpoint, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						client_name: "RankWrangler Chrome",
						redirect_uris: [options.redirectUri],
						grant_types: ["authorization_code", "refresh_token"],
						response_types: ["code"],
						token_endpoint_auth_method: "none",
					}),
				})
			);
			return {
				clientId: client.client_id,
				issuer: options.issuer,
				resource: options.resource,
				tokenEndpoint: metadata.token_endpoint,
				revocationEndpoint: metadata.revocation_endpoint,
				authorizationEndpoint: metadata.authorization_endpoint,
			};
		},
		authorizationUrl: (
			context: Context & { authorizationEndpoint: string },
			state: string,
			challenge: string
		) => {
			const authorization = new URL(context.authorizationEndpoint);
			authorization.search = new URLSearchParams({
				client_id: context.clientId,
				resource: options.resource,
				redirect_uri: options.redirectUri,
				response_type: "code",
				code_challenge_method: "S256",
				code_challenge: challenge,
				state,
			}).toString();
			return authorization.toString();
		},
		parseCallback: (value: string, state: string) => {
			const callback = new URL(value);
			if (
				callback.origin !== redirect.origin ||
				callback.pathname !== redirect.pathname ||
				callback.username ||
				callback.password ||
				callback.hash ||
				callback.searchParams.getAll("state").length !== 1 ||
				callback.searchParams.get("state") !== state ||
				callback.searchParams.getAll("code").length !== 1 ||
				callback.searchParams.has("error") ||
				callback.searchParams.getAll("iss").length > 1 ||
				(callback.searchParams.has("iss") &&
					callback.searchParams.get("iss") !== options.issuer)
			) {
				throw new Error("Extension sign-in callback rejected.");
			}
			const code = callback.searchParams.get("code");
			if (!code) {
				throw new Error("Extension sign-in callback rejected.");
			}
			return code;
		},
		exchange: async (
			context: Context,
			values: Record<string, string>,
			previous?: string
		): Promise<ChromeCredential> => {
			const response = await request(
				context.tokenEndpoint,
				form({
					...values,
					client_id: context.clientId,
					resource: options.resource,
				})
			);
			if (!response.ok) {
				const body: unknown = await response.json().catch(() => null);
				if (
					response.status === 400 &&
					z.object({ error: z.literal("invalid_grant") }).safeParse(body)
						.success
				) {
					throw new InvalidGrant();
				}
				throw new Error("Extension sign-in is unavailable.");
			}
			const result = z
				.object({
					access_token: z.string().min(1),
					refresh_token: z.string().min(1).optional(),
					expires_in: z.number().int().positive(),
					token_type: z.string().toLowerCase().pipe(z.literal("bearer")),
				})
				.parse(await response.json());
			const refreshToken = result.refresh_token ?? previous;
			const expiresAt = now() + result.expires_in * 1000;
			if (!(refreshToken && Number.isSafeInteger(expiresAt))) {
				throw new Error("Invalid extension sign-in response.");
			}
			return {
				clientId: context.clientId,
				issuer: options.issuer,
				resource: options.resource,
				tokenEndpoint: context.tokenEndpoint,
				revocationEndpoint: context.revocationEndpoint,
				accessToken: result.access_token,
				refreshToken,
				expiresAt,
			};
		},
		revoke: async (credential: ChromeCredential) => {
			const response = await request(
				credential.revocationEndpoint,
				form({
					client_id: credential.clientId,
					token: credential.refreshToken,
					token_type_hint: "refresh_token",
				})
			);
			if (!response.ok) {
				throw new Error("Remote sign-out is unavailable.");
			}
		},
	};
};
const form = (values: Record<string, string>): RequestInit => ({
	method: "POST",
	headers: { "content-type": "application/x-www-form-urlencoded" },
	body: new URLSearchParams(values).toString(),
});
export const randomOAuthValue = () =>
	encode(crypto.getRandomValues(new Uint8Array(32)));
export const pkceChallenge = async (verifier: string) =>
	encode(
		new Uint8Array(
			await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))
		)
	);
const encode = (value: Uint8Array) =>
	btoa(String.fromCharCode(...value))
		.replace(plusPattern, "-")
		.replace(slashPattern, "_")
		.replace(paddingPattern, "");
