import { createHash, createPublicKey } from "node:crypto";

export const CHROME_EXTENSION_ID = "hfoliiddbbblflnaakfggibiiphalbnc";
export const ACCESS_ISSUER = "https://thearcade.cloudflareaccess.com";

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
	extensionId: string;
	isProduction: boolean;
	publicKey: string;
	issuer: string;
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
	const issuer = env.VITE_MERCHBASE_ACCESS_ISSUER?.trim() || ACCESS_ISSUER;
	const publicKey = CHROME_EXTENSION_PUBLIC_KEY;
	if (
		issuer !== ACCESS_ISSUER ||
		deriveChromeExtensionId(publicKey) !== CHROME_EXTENSION_ID
	) {
		throw new Error("Invalid Chrome Cloudflare authentication configuration.");
	}
	return {
		extensionId: CHROME_EXTENSION_ID,
		isProduction: requireProduction,
		publicKey,
		issuer,
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
	return {
		...safariManifest,
		permissions: Array.isArray(safariManifest.permissions)
			? safariManifest.permissions.filter(
					(permission: unknown) => permission !== "identity"
				)
			: safariManifest.permissions,
	};
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

const _isValidChromePublicKey = (publicKey: string): boolean => {
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
const toChromeIdCharacter = (value: number): string =>
	String.fromCharCode(97 + value);
