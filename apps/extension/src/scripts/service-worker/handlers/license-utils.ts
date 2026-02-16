import {
	createRankWranglerClient,
	DEFAULT_API_BASE_URL,
} from "@merchbase/rankwrangler-http-client";
import { browser } from "webextension-polyfill-ts";
import z from "zod";
import { log } from "../../../utils/logger";
import type { License } from "../../types/license";

const licensePayloadSchema = z
	.object({
		email: z.string().optional(),
		usage: z.number().int().nonnegative().optional(),
		usageLimit: z.number().int().min(-1).optional(),
	})
	.optional();

const coerceNumber = (
	value: unknown,
	fallback: number,
	options?: { allowNegativeOne?: boolean }
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
	data?: Partial<License>
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
	overrides?: Partial<License>
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

const createClientForKey = (licenseKey: string) =>
	createRankWranglerClient({
		baseUrl: DEFAULT_API_BASE_URL,
		apiKey: licenseKey,
	});

export const resolveStoredLicenseKey = async (
	providedKey?: string | null
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
	const licenseKey = await resolveStoredLicenseKey();

	if (!licenseKey) {
		await browser.storage.local.remove(["license"]);
		return null;
	}

	return fetchFreshLicenseStatus(licenseKey);
}

export interface LicenseValidationResult {
	license: License;
	isValid: boolean;
	error?: string;
	status?: number;
	networkError?: boolean;
}

export async function validateLicenseKey(
	licenseKey: string
): Promise<LicenseValidationResult> {
	const trimmedKey = licenseKey.trim();

	if (!trimmedKey) {
		throw new Error("License key cannot be empty");
	}

	const timestamp = Date.now();

	try {
		const response =
			await createClientForKey(trimmedKey).license.validate.mutate();
		const parsed = licensePayloadSchema.safeParse(response);
		const payload = parsed.success ? parsed.data : undefined;

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
	} catch (error) {
		log.error("License validation failed:", error);

		const errorCode = resolveTrpcErrorCode(error);
		const status = resolveTrpcHttpStatus(error);

		let message: string | undefined;
		if (errorCode === "UNAUTHORIZED") {
			message = "Invalid or expired license key";
		} else if (errorCode === "TOO_MANY_REQUESTS") {
			message = "Daily usage limit exceeded";
		} else if (error instanceof Error) {
			message = error.message;
		} else {
			message = "Network error during validation";
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
			status: status ?? (errorCode === "TOO_MANY_REQUESTS" ? 429 : 401),
			networkError: errorCode === null,
		};
	}
}

export async function fetchFreshLicenseStatus(
	licenseKey: string
): Promise<License> {
	const trimmedKey = licenseKey.trim();

	if (!trimmedKey) {
		throw new Error("License key cannot be empty");
	}

	const timestamp = Date.now();

	try {
		const response =
			await createClientForKey(trimmedKey).license.status.mutate();
		const parsed = licensePayloadSchema.safeParse(response);
		const payload = parsed.success ? parsed.data : undefined;

		const license = await saveLicenseSnapshot(trimmedKey, {
			email: typeof payload?.email === "string" ? payload.email : "",
			isValid: true,
			lastValidated: timestamp,
			usage: coerceNumber(payload?.usage, 0),
			usageLimit: coerceNumber(payload?.usageLimit, 0, {
				allowNegativeOne: true,
			}),
		});

		return license;
	} catch (error) {
		const errorCode = resolveTrpcErrorCode(error);
		if (errorCode === "UNAUTHORIZED") {
			await browser.storage.sync.remove(["licenseKey"]);

			const license = await saveLicenseSnapshot(trimmedKey, {
				email: "",
				isValid: false,
				lastValidated: timestamp,
				usage: 0,
				usageLimit: 0,
			});

			return license;
		}

		const message =
			error instanceof Error
				? error.message
				: "Unknown error fetching license status";

		log.error("Failed to fetch license status:", error);
		throw new Error(message);
	}
}

const resolveTrpcErrorCode = (error: unknown): string | null => {
	if (!error || typeof error !== "object") {
		return null;
	}

	if ("data" in error) {
		const data = (error as { data?: { code?: string } }).data;
		if (data?.code) {
			return data.code;
		}
	}

	return null;
};

const resolveTrpcHttpStatus = (error: unknown): number | undefined => {
	if (!error || typeof error !== "object") {
		return undefined;
	}

	if ("data" in error) {
		const data = (error as { data?: { httpStatus?: number } }).data;
		if (typeof data?.httpStatus === "number") {
			return data.httpStatus;
		}
	}

	return undefined;
};
