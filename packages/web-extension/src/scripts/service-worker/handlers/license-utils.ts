import { browser } from "webextension-polyfill-ts";
import z from "zod";
import { log } from "../../../utils/logger";
import type { License } from "../../types/license";

const API_BASE_URL = "https://merchbase.co/api";

const licensePayloadSchema = z
	.object({
		email: z.string().optional(),
		usage: z.number().int().nonnegative().optional(),
		usageLimit: z.number().int().min(-1).optional(),
	})
	.optional();

const licenseResponseSchema = z.object({
	data: licensePayloadSchema,
	error: z.string().optional(),
});

const coerceNumber = (
	value: unknown,
	fallback: number,
	options?: { allowNegativeOne?: boolean },
): number => {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}

	if (options?.allowNegativeOne && value === -1) {
		return -1;
	}

	return fallback;
};

const normalizeLicenseSnapshot = (
	key: string,
	data?: Partial<License>,
): License => {
	const trimmedKey = key.trim();

	return {
		key: trimmedKey,
		email: typeof data?.email === "string" ? data.email : "",
		isValid: data?.isValid ?? false,
		lastValidated: coerceNumber(data?.lastValidated, 0),
		usage: coerceNumber(data?.usage, 0),
		usageLimit: coerceNumber(data?.usageLimit, 0, { allowNegativeOne: true }),
	};
};

const saveLicenseSnapshot = async (
	key: string,
	overrides?: Partial<License>,
): Promise<License> => {
	const normalized = normalizeLicenseSnapshot(key, {
		...overrides,
		lastValidated:
			typeof overrides?.lastValidated === "number"
				? overrides.lastValidated
				: Date.now(),
	});

	await browser.storage.local.set({ license: normalized });
	return normalized;
};

export const resolveStoredLicenseKey = async (
	providedKey?: string | null,
): Promise<string | null> => {
	if (typeof providedKey === "string" && providedKey.trim().length > 0) {
		return providedKey.trim();
	}

	const [syncResult, localResult] = await Promise.all([
		browser.storage.sync.get(["licenseKey"]),
		browser.storage.local.get(["license"]),
	]);

	const syncKey =
		typeof syncResult.licenseKey === "string"
			? syncResult.licenseKey.trim()
			: "";
	const localKey =
		typeof localResult.license?.key === "string"
			? localResult.license.key.trim()
			: "";

	const resolved = syncKey || localKey;

	return resolved.length > 0 ? resolved : null;
};

export async function getCurrentLicenseStatus(): Promise<License | null> {
	const [syncResult, localResult] = await Promise.all([
		browser.storage.sync.get(["licenseKey"]),
		browser.storage.local.get(["license"]),
	]);

	const storedLicenseRaw = localResult.license;
	const storedLicense =
		storedLicenseRaw && typeof storedLicenseRaw.key === "string"
			? normalizeLicenseSnapshot(storedLicenseRaw.key, storedLicenseRaw)
			: null;

	const syncKey =
		typeof syncResult.licenseKey === "string"
			? syncResult.licenseKey.trim()
			: "";

	const activeKey = syncKey || storedLicense?.key || "";

	if (!activeKey) {
		return null;
	}

	if (storedLicense && storedLicense.key === activeKey) {
		return storedLicense;
	}

	return normalizeLicenseSnapshot(activeKey, {
		email: storedLicense?.email ?? "",
		lastValidated: storedLicense?.lastValidated ?? 0,
		usage: storedLicense?.usage ?? 0,
		usageLimit: storedLicense?.usageLimit ?? 0,
		isValid: false,
	});
}

export interface LicenseValidationResult {
	license: License;
	isValid: boolean;
	error?: string;
	status?: number;
	networkError?: boolean;
}

export async function validateLicenseKey(
	licenseKey: string,
): Promise<LicenseValidationResult> {
	const trimmedKey = licenseKey.trim();

	if (!trimmedKey) {
		throw new Error("License key cannot be empty");
	}

	const timestamp = Date.now();

	try {
		const response = await fetch(`${API_BASE_URL}/license/validate`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				licenseKey: trimmedKey,
			}),
		});

		if (response.ok) {
			const json = await response.json().catch(() => ({}));
			const parsed = licenseResponseSchema.safeParse(json);
			const payload = parsed.success ? parsed.data.data : undefined;

			const license = await saveLicenseSnapshot(trimmedKey, {
				email: payload?.email ?? "",
				isValid: true,
				lastValidated: timestamp,
				usage: payload?.usage ?? 0,
				usageLimit: payload?.usageLimit ?? 0,
			});

			return {
				license,
				isValid: true,
			};
		}

		let message: string | undefined;

		try {
			const errorJson = await response.json();
			const parsedError = licenseResponseSchema.safeParse(errorJson);
			if (parsedError.success && parsedError.data.error) {
				message = parsedError.data.error;
			}
		} catch {
			// Ignore body parse errors
		}

		if (!message) {
			if (response.status === 401) {
				message = "Invalid or expired license key";
			} else if (response.status === 429) {
				message = "Daily usage limit exceeded";
			} else {
				message = `License validation failed (${response.status})`;
			}
		}

		const license = await saveLicenseSnapshot(trimmedKey, {
			isValid: false,
			lastValidated: timestamp,
			usage: 0,
			usageLimit: 0,
		});

		return {
			license,
			isValid: false,
			error: message,
			status: response.status,
		};
	} catch (error) {
		log.error("License validation failed:", error);

		const license = await saveLicenseSnapshot(trimmedKey, {
			isValid: false,
			lastValidated: timestamp,
			usage: 0,
			usageLimit: 0,
		});

		return {
			license,
			isValid: false,
			error:
				error instanceof Error
					? error.message
					: "Network error during validation",
			networkError: true,
		};
	}
}

export async function fetchFreshLicenseStatus(
	licenseKey: string,
): Promise<any | null> {
	const trimmedKey = licenseKey.trim();

	if (!trimmedKey) {
		return null;
	}

	try {
		const response = await fetch(`${API_BASE_URL}/license/status`, {
			method: "GET",
			headers: {
				Authorization: `Bearer ${trimmedKey}`,
			},
		});

		if (response.ok) {
			const data = await response.json();
			return data.data;
		}

		return null;
	} catch (error) {
		log.error("Failed to fetch license status:", error);
		return null;
	}
}
