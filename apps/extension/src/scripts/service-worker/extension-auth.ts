import { createClerkClient } from "@clerk/chrome-extension/background";
import { browser } from "webextension-polyfill-ts";
import { createClerkTokenProvider } from "./clerk-token-cache";

const extensionAuthMode =
	import.meta.env.VITE_RANKWRANGLER_EXTENSION_AUTH_MODE?.trim() ?? "chrome";
const publishableKey =
	import.meta.env.VITE_MERCHBASE_CLERK_PUBLISHABLE_KEY?.trim();
const syncHost =
	import.meta.env.VITE_MERCHBASE_CLERK_SYNC_HOST?.trim() ??
	"https://clerk.merchbase.co";
const accountUrl =
	import.meta.env.VITE_MERCHBASE_CLERK_ACCOUNT_URL?.trim() || syncHost;
const safariNativeApplicationId =
	import.meta.env.VITE_RANKWRANGLER_SAFARI_NATIVE_APPLICATION_ID?.trim() ??
	"merchbase.rankwrangler";

const safariOAuthConfiguration = {
	authorizationURL:
		import.meta.env.VITE_RANKWRANGLER_CLERK_OAUTH_AUTHORIZATION_URL?.trim() ??
		"https://clerk.merchbase.co/oauth/authorize",
	tokenURL:
		import.meta.env.VITE_RANKWRANGLER_CLERK_OAUTH_TOKEN_URL?.trim() ??
		"https://clerk.merchbase.co/oauth/token",
	clientId:
		import.meta.env.VITE_RANKWRANGLER_CLERK_OAUTH_CLIENT_ID?.trim() ?? "",
	redirectURI:
		import.meta.env.VITE_RANKWRANGLER_CLERK_OAUTH_REDIRECT_URI?.trim() ??
		"rankwrangler://oauth/callback",
	scopes:
		import.meta.env.VITE_RANKWRANGLER_CLERK_OAUTH_SCOPES?.trim() ??
		"openid email profile",
};

export type ExtensionAuthState =
	| { status: "signed-out"; email: null; error?: undefined }
	| { status: "signed-in"; email: string | null; error?: undefined }
	| { status: "denied"; email: null; error: string };

let clerkPromise: Promise<
	Awaited<ReturnType<typeof createClerkClient>>
> | null = null;
const chromeTokenProvider = createClerkTokenProvider();

const getClerk = () => {
	if (!publishableKey) {
		throw new Error("Clerk extension authentication is not configured.");
	}

	clerkPromise ??= createClerkClient({ publishableKey, syncHost });
	return clerkPromise;
};

const sendSafariNativeMessage = async (message: Record<string, string>) => {
	const response = (await browser.runtime.sendNativeMessage(
		safariNativeApplicationId,
		message
	)) as SafariNativeResponse;

	if ("error" in response) {
		throw new Error(response.error);
	}

	return response;
};

export const getExtensionToken = async () => {
	if (extensionAuthMode === "safari") {
		const response = await sendSafariNativeMessage({ type: "getAccessToken" });
		return response.accessToken ?? null;
	}

	const clerk = await getClerk();
	const session = clerk.session;
	if (!session) {
		chromeTokenProvider.clear();
		return null;
	}

	return chromeTokenProvider.getToken(session);
};

export const getExtensionAuthState = async (): Promise<ExtensionAuthState> => {
	try {
		if (extensionAuthMode === "safari") {
			const response = await sendSafariNativeMessage({
				type: "getAccessToken",
			});
			return response.accessToken
				? { status: "signed-in", email: null }
				: { status: "signed-out", email: null };
		}

		const clerk = await getClerk();
		if (!clerk.session) {
			chromeTokenProvider.clear();
			return { status: "signed-out", email: null };
		}

		return {
			status: "signed-in",
			email: clerk.user?.primaryEmailAddress?.emailAddress ?? null,
		};
	} catch (_error) {
		return {
			status: "denied",
			email: null,
			error:
				"Unable to connect to your Merchbase account. Check your connection and try again.",
		};
	}
};

export const openExtensionAccount = async () => {
	if (extensionAuthMode === "safari") {
		await sendSafariNativeMessage({
			type: "beginOAuth",
			...safariOAuthConfiguration,
		});
		return;
	}

	await browser.tabs.create({ url: accountUrl });
};

type SafariNativeResponse =
	| { success: true; accessToken?: string }
	| { success: false; error: string };
