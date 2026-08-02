import { createClerkClient } from "@clerk/chrome-extension/background";
import { browser } from "webextension-polyfill-ts";

const extensionAuthMode =
	import.meta.env.VITE_EXTENSION_AUTH_MODE?.trim() ?? "chrome";
const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim();
const syncHost =
	import.meta.env.VITE_CLERK_SYNC_HOST?.trim() ?? "https://clerk.merchbase.co";
const safariNativeApplicationId =
	import.meta.env.VITE_SAFARI_NATIVE_APPLICATION_ID?.trim() ??
	"merchbase.rankwrangler";

const safariOAuthConfiguration = {
	authorizationURL:
		import.meta.env.VITE_CLERK_OAUTH_AUTHORIZATION_URL?.trim() ??
		"https://clerk.merchbase.co/oauth/authorize",
	tokenURL:
		import.meta.env.VITE_CLERK_OAUTH_TOKEN_URL?.trim() ??
		"https://clerk.merchbase.co/oauth/token",
	clientId: import.meta.env.VITE_CLERK_OAUTH_CLIENT_ID?.trim() ?? "",
	redirectURI:
		import.meta.env.VITE_CLERK_OAUTH_REDIRECT_URI?.trim() ??
		"rankwrangler://oauth/callback",
	scopes:
		import.meta.env.VITE_CLERK_OAUTH_SCOPES?.trim() ?? "openid email profile",
};

export type ExtensionAuthState =
	| { status: "signed-out"; email: null; error?: undefined }
	| { status: "signed-in"; email: string | null; error?: undefined }
	| { status: "denied"; email: null; error: string };

let clerkPromise: Promise<
	Awaited<ReturnType<typeof createClerkClient>>
> | null = null;

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
	return clerk.session?.getToken() ?? null;
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
			return { status: "signed-out", email: null };
		}

		return {
			status: "signed-in",
			email: clerk.user?.primaryEmailAddress?.emailAddress ?? null,
		};
	} catch (error) {
		return {
			status: "denied",
			email: null,
			error:
				error instanceof Error ? error.message : "Authentication unavailable.",
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

	await browser.tabs.create({ url: syncHost });
};

type SafariNativeResponse =
	| { success: true; accessToken?: string }
	| { success: false; error: string };
