import { createHash, createPublicKey } from "node:crypto";

export const CHROME_EXTENSION_ID = "hfoliiddbbblflnaakfggibiiphalbnc";
export const CLERK_SYNC_HOST = "https://clerk.merchbase.co";

const CHROME_PUBLIC_KEY_PARTS = [
	"MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAj9z/DGS0R6L7u4KJAufm1awcR7RWZodr067paiMqCOqkU79IY3uO16l4Uj0z20tnL63",
	"kYNM7wIxjX3MKvaC8g9cIG2inDgnpN8NgknZ8nUGRA/VnRlQOA1FuObEDmOj6EaY/bgiplhuRvqQan2vStrsiBa+UbVjlLhjsFlICwcIdjgw1M0MfhdsG",
	"/3jTsgCPem/F3qDPhRy0gpgfizH16DGJX7j9Y2OkcIJrT2PsULv+DHkjxKogfCXjesKTXKN/eOWLCCx+Tx99MPUQTJJo5WRGYF7Cs62xFRnwQut3c2XxiXjh+Hf1b",
	"Z63PI6Xa9Thc4bE2vUv/rJ3seXvsfT0bwIDAQAB",
] as const;

export const CHROME_EXTENSION_PUBLIC_KEY = CHROME_PUBLIC_KEY_PARTS.join("");

export type ChromeBuildEnvironment = Readonly<
	Record<string, string | undefined>
>;

export interface ChromeAuthBuildConfig {
	accountUrl: string;
	extensionId: string;
	isProduction: boolean;
	publishableKey?: string;
	publicKey: string;
	syncHost: string;
}

export type ChromeManifest = Record<string, unknown>;
export type ChromeBuildTarget = "chrome" | "safari";

export const resolveChromeAuthBuildConfig = ({
	env,
	requireProduction,
}: {
	env: ChromeBuildEnvironment;
	requireProduction: boolean;
}): ChromeAuthBuildConfig => {
	const publishableKey = readEnv(env, "VITE_MERCHBASE_CLERK_PUBLISHABLE_KEY");
	const syncHostInput = readEnv(env, "VITE_MERCHBASE_CLERK_SYNC_HOST");
	const accountUrlInput = readEnv(env, "VITE_MERCHBASE_CLERK_ACCOUNT_URL");
	const syncHost = normalizeUrl(syncHostInput ?? CLERK_SYNC_HOST);
	const publicKey = CHROME_EXTENSION_PUBLIC_KEY;
	const extensionId = CHROME_EXTENSION_ID;
	const accountUrl = normalizeUrl(accountUrlInput ?? syncHost);
	const errors = [
		...validateIdentity(publicKey),
		...validateEndpoints({ accountUrl, accountUrlInput, syncHost }),
		...(requireProduction
			? validateProductionInputs({
					accountUrlInput,
					publishableKey,
					syncHostInput,
				})
			: []),
	];

	if (errors.length > 0) {
		throw new Error(
			`Chrome ${requireProduction ? "production " : ""}configuration invalid: ${errors.join("; ")}`
		);
	}

	return {
		accountUrl,
		extensionId,
		isProduction: requireProduction,
		publishableKey,
		publicKey,
		syncHost,
	};
};

export const createChromeManifest = ({
	manifest,
	config,
	target,
}: {
	config: ChromeAuthBuildConfig;
	manifest: ChromeManifest;
	target: ChromeBuildTarget;
}): ChromeManifest => {
	if (target === "chrome") {
		return { ...manifest, key: config.publicKey };
	}

	const { key: _chromeKey, ...safariManifest } = manifest;
	return safariManifest;
};

export const deriveChromeExtensionId = (publicKey: string): string => {
	const digest = createHash("sha256")
		.update(decodeChromePublicKey(publicKey))
		.digest();

	return [...digest.subarray(0, 16)]
		.map((byte) => {
			const highNibble = Math.floor(byte / 16);
			const lowNibble = byte - highNibble * 16;
			return `${toChromeIdCharacter(highNibble)}${toChromeIdCharacter(lowNibble)}`;
		})
		.join("");
};

const isValidChromePublicKey = (publicKey: string): boolean => {
	try {
		createPublicKey({
			key: decodeChromePublicKey(publicKey),
			format: "der",
			type: "spki",
		});
		return true;
	} catch {
		return false;
	}
};

const decodeChromePublicKey = (publicKey: string): Buffer => {
	if (!BASE64_PUBLIC_KEY_REGEX.test(publicKey)) {
		throw new Error("Invalid Chrome public key encoding");
	}

	const decoded = Buffer.from(publicKey, "base64");
	if (
		decoded.length === 0 ||
		decoded.toString("base64").replace(TRAILING_PADDING_REGEX, "") !==
			publicKey.replace(TRAILING_PADDING_REGEX, "")
	) {
		throw new Error("Invalid Chrome public key encoding");
	}

	return decoded;
};

const BASE64_PUBLIC_KEY_REGEX = /^[A-Za-z0-9+/]+={0,2}$/;
const TRAILING_PADDING_REGEX = /=+$/;
const TRAILING_SLASHES_REGEX = /\/+$/;

const normalizeUrl = (value: string): string =>
	value.replace(TRAILING_SLASHES_REGEX, "");

const isMerchbaseHttpsUrl = (value: string): boolean => {
	try {
		const url = new URL(value);
		return (
			url.protocol === "https:" &&
			(url.hostname === "merchbase.co" ||
				url.hostname.endsWith(".merchbase.co"))
		);
	} catch {
		return false;
	}
};

const readEnv = (
	env: ChromeBuildEnvironment,
	name: string
): string | undefined => {
	const value = env[name]?.trim();
	return value || undefined;
};

const toChromeIdCharacter = (value: number): string =>
	String.fromCharCode(97 + value);

const validateIdentity = (publicKey: string): string[] => {
	if (!isValidChromePublicKey(publicKey)) {
		return ["the committed Chrome public key is not a valid DER public key"];
	}
	if (deriveChromeExtensionId(publicKey) !== CHROME_EXTENSION_ID) {
		return ["the committed Chrome public key does not derive the committed extension ID"];
	}
	return [];
};

const validateEndpoints = ({
	accountUrl,
	accountUrlInput,
	syncHost,
}: {
	accountUrl: string;
	accountUrlInput?: string;
	syncHost: string;
}): string[] => {
	const errors: string[] = [];
	if (syncHost !== CLERK_SYNC_HOST) {
		errors.push(
			"VITE_MERCHBASE_CLERK_SYNC_HOST must be the production Merchbase Clerk Sync Host"
		);
	}
	if (accountUrlInput && !isMerchbaseHttpsUrl(accountUrl)) {
		errors.push("VITE_MERCHBASE_CLERK_ACCOUNT_URL must be an HTTPS Merchbase URL");
	}
	return errors;
};

const validateProductionInputs = ({
	accountUrlInput,
	publishableKey,
	syncHostInput,
}: {
	accountUrlInput?: string;
	publishableKey?: string;
	syncHostInput?: string;
}): string[] => {
	const errors: string[] = [];
	if (!publishableKey) {
		errors.push(
			"VITE_MERCHBASE_CLERK_PUBLISHABLE_KEY is required for a production build"
		);
	} else if (!publishableKey.startsWith("pk_live_")) {
		errors.push("VITE_MERCHBASE_CLERK_PUBLISHABLE_KEY must be a production pk_live_ key");
	} else if (!isValidClerkPublishableKey(publishableKey)) {
		errors.push(
		"VITE_MERCHBASE_CLERK_PUBLISHABLE_KEY must be a valid production Clerk publishable key"
	);
	}
	if (!syncHostInput) {
		errors.push(
			"VITE_MERCHBASE_CLERK_SYNC_HOST must be explicitly supplied for a production build"
		);
	}
	if (!accountUrlInput) {
		errors.push(
			"VITE_MERCHBASE_CLERK_ACCOUNT_URL must be explicitly supplied for a production build"
		);
	}
	return errors;
};

const isValidClerkPublishableKey = (publishableKey: string): boolean => {
	const encodedFrontendApi = publishableKey.split("_")[2];
	if (!encodedFrontendApi) {
		return false;
	}

	try {
		const decodedFrontendApi = Buffer.from(
			encodedFrontendApi,
			"base64"
		).toString();
		const withoutTrailingMarker = decodedFrontendApi.slice(0, -1);
		return (
			decodedFrontendApi.endsWith("$") &&
			!withoutTrailingMarker.includes("$") &&
			withoutTrailingMarker.includes(".")
		);
	} catch {
		return false;
	}
};
