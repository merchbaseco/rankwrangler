import { expect, test } from "bun:test";
import { createChromeOAuth } from "../src/scripts/service-worker/oauth-client";

const issuer = "https://example.cloudflareaccess.com";
const resource = "https://rankwrangler-api.merchbase.co/";
const redirectUri =
	"https://hfoliiddbbblflnaakfggibiiphalbnc.chromiumapp.org/oauth/callback";
const fixture = (changeCallback?: (url: URL) => void) => {
	let stored: unknown = null;
	let nextRead: Promise<unknown> | null = null;
	let exchanges = 0;
	const requests: { url: string; init: RequestInit }[] = [];
	const auth = createChromeOAuth({
		issuer,
		resource,
		redirectUri,
		read: () => {
			const pending = nextRead;
			nextRead = null;
			return pending ?? Promise.resolve(stored);
		},
		write: (value) => {
			stored = value;
			return Promise.resolve();
		},
		clear: () => {
			stored = null;
			return Promise.resolve();
		},
		launch: (value) => {
			const authorization = new URL(value);
			const callback = new URL(redirectUri);
			callback.search = new URLSearchParams({
				code: "one-time-code",
				state: authorization.searchParams.get("state") ?? "",
				iss: issuer,
			}).toString();
			changeCallback?.(callback);
			return Promise.resolve(callback.toString());
		},
		fetch: (input, init = {}) =>
			Promise.resolve(
				(() => {
					const url = String(input);
					requests.push({ url, init });
					if (url === resource) {
						return new Response(null, {
							status: 401,
							headers: {
								"www-authenticate": `Bearer resource_metadata="${resource}.well-known/oauth-protected-resource"`,
							},
						});
					}
					if (url.endsWith("/.well-known/oauth-protected-resource")) {
						return Response.json({ resource, authorization_servers: [issuer] });
					}
					if (url.endsWith("/.well-known/oauth-authorization-server")) {
						return Response.json({
							issuer,
							authorization_endpoint: `${issuer}/authorize`,
							token_endpoint: `${issuer}/token`,
							registration_endpoint: `${issuer}/register`,
							revocation_endpoint: `${issuer}/revoke`,
							code_challenge_methods_supported: ["S256"],
						});
					}
					if (url.endsWith("/register")) {
						return Response.json(
							{ client_id: "public-client" },
							{ status: 201 }
						);
					}
					if (url.endsWith("/token")) {
						exchanges++;
						return Response.json({
							access_token: `opaque-access-${exchanges}`,
							refresh_token: `refresh-${exchanges}`,
							expires_in: 300,
							token_type: "Bearer",
						});
					}
					if (url.endsWith("/revoke")) {
						return new Response(null, { status: 200 });
					}
					throw new Error("Unexpected network target");
				})()
			),
	});
	return {
		auth,
		deferRead: (pending: Promise<unknown>) => {
			nextRead = pending;
		},
		requests,
		read: () => stored,
		set: (value: unknown) => {
			stored = value;
		},
	};
};
test("performs resource-bound public PKCE and stores renewable context only after matching callback", async () => {
	const { auth, requests, read } = fixture();
	await auth.signIn();
	expect(await auth.getAccessToken()).toBe("opaque-access-1");
	const registration = requests.find((x) => x.url.endsWith("/register"));
	expect(JSON.parse(String(registration?.init.body))).toMatchObject({
		redirect_uris: [redirectUri],
		token_endpoint_auth_method: "none",
	});
	const token = requests.find((x) => x.url.endsWith("/token"));
	const form = new URLSearchParams(String(token?.init.body));
	expect(form.get("resource")).toBe(resource);
	expect(form.get("code_verifier")?.length).toBe(43);
	expect(read()).toMatchObject({ issuer, resource, clientId: "public-client" });
	await auth.signOut();
	expect(read()).toBeNull();
	expect(await auth.getAccessToken()).toBeNull();
	expect(requests.some((x) => x.url.endsWith("/revoke"))).toBe(true);
	expect(requests.every((x) => x.init.redirect === "manual")).toBe(true);
});
for (const [name, change] of [
	["wrong state", (url: URL) => url.searchParams.set("state", "wrong")],
	[
		"wrong callback",
		(url: URL) => {
			url.hostname = "evil.chromiumapp.org";
		},
	],
	["duplicate code", (url: URL) => url.searchParams.append("code", "other")],
	[
		"wrong issuer",
		(url: URL) => url.searchParams.set("iss", "https://evil.example"),
	],
] as const) {
	test(`rejects ${name} before code exchange`, async () => {
		const { auth, requests, read } = fixture(change);
		await expect(auth.signIn()).rejects.toThrow("not completed");
		expect(requests.some((x) => x.url.endsWith("/token"))).toBe(false);
		expect(read()).toBeNull();
	});
}
test("restoration rejects a different issuer before sending its secret", async () => {
	const { auth, requests, set, read } = fixture();
	set({
		accessToken: "old",
		refreshToken: "private",
		expiresAt: 1,
		clientId: "public-client",
		issuer: "https://other.cloudflareaccess.com",
		resource,
		tokenEndpoint: `${issuer}/token`,
		revocationEndpoint: `${issuer}/revoke`,
	});
	expect(await auth.getAccessToken()).toBeNull();
	expect(requests).toEqual([]);
	expect(read()).toBeNull();
});
test("concurrent refresh shares one exchange and logout revokes a stale rotated result", async () => {
	let stored: unknown = {
		accessToken: "expired",
		refreshToken: "old-refresh",
		expiresAt: 1,
		clientId: "client",
		issuer,
		resource,
		tokenEndpoint: `${issuer}/token`,
		revocationEndpoint: `${issuer}/revoke`,
	};
	let finish = (_response: Response) => {
		throw new Error("Refresh has not started");
	};
	let begin = () => undefined;
	const started = new Promise<void>((resolve) => {
		begin = resolve;
	});
	const revocations: string[] = [];
	let exchanges = 0;
	const auth = createChromeOAuth({
		issuer,
		resource,
		redirectUri,
		read: () => Promise.resolve(stored),
		write: (value) => {
			stored = value;
			return Promise.resolve();
		},
		clear: () => {
			stored = null;
			return Promise.resolve();
		},
		launch: () => Promise.reject(new Error("Unexpected browser launch")),
		fetch: (input, init = {}) => {
			if (String(input).endsWith("/token")) {
				exchanges++;
				return new Promise<Response>((resolve) => {
					finish = resolve;
					begin();
				});
			}
			if (String(input).endsWith("/revoke")) {
				revocations.push(
					new URLSearchParams(String(init.body)).get("token") ?? ""
				);
				return Promise.resolve(new Response(null, { status: 200 }));
			}
			return Promise.reject(new Error("Unexpected target"));
		},
	});
	const first = auth.getAccessToken();
	const second = auth.getAccessToken();
	await started;
	await auth.signOut();
	finish(
		Response.json({
			access_token: "new",
			refresh_token: "rotated-refresh",
			expires_in: 300,
			token_type: "Bearer",
		})
	);
	expect(await first).toBeNull();
	expect(await second).toBeNull();
	expect(exchanges).toBe(1);
	expect(stored).toBeNull();
	expect(revocations).toEqual(["old-refresh", "rotated-refresh"]);
});

test("a delayed logout cannot clear a newer sign-in", async () => {
	const { auth, deferRead, read } = fixture();
	let finish = (_value: unknown) => {
		throw new Error("Read has not started");
	};
	deferRead(
		new Promise((resolve) => {
			finish = resolve;
		})
	);
	const logout = auth.signOut();
	await auth.signIn();
	finish(null);
	await logout;
	expect(read()).toMatchObject({ accessToken: "opaque-access-1" });
	expect(await auth.getAccessToken()).toBe("opaque-access-1");
});
