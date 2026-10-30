import { browser } from "webextension-polyfill-ts";
import { createChromeOAuth } from "./oauth-client";

const extensionAuthMode =
	import.meta.env.VITE_RANKWRANGLER_EXTENSION_AUTH_MODE?.trim() ?? "chrome";
const safariNativeApplicationId =
	import.meta.env.VITE_RANKWRANGLER_SAFARI_NATIVE_APPLICATION_ID?.trim() ??
	"merchbase.rankwrangler";

const safariOAuthConfiguration = {
	issuer:
		import.meta.env.VITE_MERCHBASE_ACCESS_ISSUER?.trim() ??
		"https://thearcade.cloudflareaccess.com",
	resource:
		import.meta.env.VITE_RANKWRANGLER_SAFARI_OAUTH_RESOURCE?.trim() ??
		"https://rankwrangler-api.merchbase.co/",
	redirectURI:
		import.meta.env.VITE_RANKWRANGLER_SAFARI_OAUTH_REDIRECT_URI?.trim() ??
		"https://rankwrangler.merchbase.co/oauth/safari/callback",
};

export type ExtensionAuthState =
	| { status: "signed-out"; email: null; error?: undefined }
	| { status: "signed-in"; email: string | null; error?: undefined }
	| { status: "denied"; email: null; error: string };

const STORAGE_KEY = "merchbase-cloudflare-oauth";
const storageReady =
	extensionAuthMode === "chrome"
		? globalThis.chrome.storage.local.setAccessLevel({
				accessLevel: "TRUSTED_CONTEXTS",
			})
		: Promise.resolve();
const chromeAuth =
	extensionAuthMode === "chrome"
		? createChromeOAuth({
				issuer: safariOAuthConfiguration.issuer,
				resource: "https://rankwrangler-api.merchbase.co/",
				redirectUri: browser.identity.getRedirectURL("oauth/callback"),
				fetch,
				launch: (url) =>
					browser.identity.launchWebAuthFlow({ url, interactive: true }),
				read: async () => {
					await storageReady;
					return (await browser.storage.local.get(STORAGE_KEY))[STORAGE_KEY];
				},
				write: async (credential) => {
					await storageReady;
					await browser.storage.local.set({ [STORAGE_KEY]: credential });
				},
				clear: () => browser.storage.local.remove(STORAGE_KEY),
			})
		: null;

const sendSafariNativeMessage = async (message: Record<string, string>) => {
	const response: unknown = await browser.runtime.sendNativeMessage(
		safariNativeApplicationId,
		message
	);
	if (
		!response ||
		typeof response !== "object" ||
		!("success" in response) ||
		response.success !== true
	) {
		throw new Error("Native sign-in unavailable.");
	}
	return "accessToken" in response && typeof response.accessToken === "string"
		? response.accessToken
		: null;
};
export const getExtensionToken = async () =>
	chromeAuth
		? chromeAuth.getAccessToken()
		: sendSafariNativeMessage({ type: "getAccessToken" });
export const getExtensionAuthState = async (): Promise<ExtensionAuthState> => {
	try {
		return (await getExtensionToken())
			? { status: "signed-in", email: null }
			: { status: "signed-out", email: null };
	} catch {
		return {
			status: "denied",
			email: null,
			error:
				"Unable to connect to your Merchbase account. Check your connection and try again.",
		};
	}
};
export const openExtensionAccount = async () => {
	if (chromeAuth) {
		if (await chromeAuth.getAccessToken()) {
			await browser.tabs.create({ url: "https://merchbase.co/account" });
		} else {
			await chromeAuth.signIn();
		}
	} else {
		await sendSafariNativeMessage({
			type: "beginOAuth",
			...safariOAuthConfiguration,
		});
	}
};
export const signOutExtension = async () => {
	if (chromeAuth) {
		await chromeAuth.signOut();
	} else {
		await sendSafariNativeMessage({ type: "signOut" });
	}
};
