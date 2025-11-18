import jwt from "jsonwebtoken";
import { nanoid } from "nanoid";
import { env } from "@/config/env.js";
import { type License, type LicenseMetadata } from "@/db/schema.js";
import { createLicense as dbCreateLicense } from "@/db/license/create-license.js";
import { deleteLicense as dbDeleteLicense } from "@/db/license/delete-license.js";
import { getLicenseById as dbGetLicenseById } from "@/db/license/get-license-by-id.js";
import { listLicenses as dbListLicenses } from "@/db/license/list-licenses.js";
import { resetLicenseUsage as dbResetLicenseUsage } from "@/db/license/reset-license-usage.js";
import { checkAndResetDailyUsage } from "@/db/license/check-and-reset-daily-usage.js";
import { updateUsageStats } from "@/db/license/update-usage-stats.js";
import { getLicenseStats as dbGetLicenseStats } from "@/db/license/get-license-stats.js";

export interface LicensePayload {
	sub: string; // License ID
	email: string; // User email
	iat: number; // Issued at
}

export interface ValidationResult {
	valid: boolean;
	error?: string;
	data?: {
		email: string;
		usageToday: number;
		dailyLimit: number;
	};
}

export const generateLicenseKey = (
	email: string,
): string => {
	const licenseId = nanoid(12);

	const payload: LicensePayload = {
		sub: licenseId,
		email,
		iat: Math.floor(Date.now() / 1000),
	};

	return jwt.sign(payload, env.LICENSE_SECRET);
};

export const validateLicense = async (
	key: string,
): Promise<ValidationResult> => {
	try {
		console.log(
			`[License Validation] Starting validation for key: ${key.substring(0, 20)}...`,
		);

		// 1. Verify JWT signature and decode
		const decoded = jwt.verify(key, env.LICENSE_SECRET) as LicensePayload;
		console.log(`[License Validation] JWT decoded successfully:`, {
			sub: decoded.sub,
			email: decoded.email,
			iat: decoded.iat,
		});

		// 2. Find license in database
		console.log(
			`[License Validation] Searching database for license with key...`,
		);
		let license = await dbGetLicenseById('key', key);
		console.log('[License Validation] License query result:', JSON.stringify(license));
		if (!license) {
			console.log(
				`[License Validation] License not found in database for key: ${key.substring(0, 20)}...`,
			);

			// Try to find by JWT subject (license ID)
			console.log(`[License Validation] Trying to find by ID: ${decoded.sub}`);
			const licenseById = await dbGetLicenseById('id', decoded.sub);

			if (licenseById) {
				console.log(
					`[License Validation] Found license by ID, but key mismatch. DB key: ${licenseById.key ? licenseById.key.substring(0, 20) + "..." : "NULL"}`,
				);
			} else {
				console.log(`[License Validation] License not found by ID either`);
			}

			return { valid: false, error: "License not found in database" };
		}

		console.log(`[License Validation] License found:`, {
			id: license.id,
			email: license.email,
			hasKey: !!license.key,
			keyMatch: license.key === key,
		});

		// 3. Check and reset daily usage if needed
		await checkAndResetDailyUsage(license);
		
		// Refresh license data after potential reset
		license = await dbGetLicenseById('id', license.id);
		if (!license) {
			return { valid: false, error: "License not found after reset" };
		}

		// 6. Check daily rate limits (skip if unlimited)
		const dailyLimit = license.metadata.limits.requests_per_day;
		if (dailyLimit !== -1 && license.usageToday >= dailyLimit) {
			return {
				valid: false,
				error: `Daily limit of ${dailyLimit} requests exceeded. Resets at midnight UTC.`,
			};
		}

		// 7. Update usage statistics
		await updateUsageStats(license);

		return {
			valid: true,
			data: {
				email: license.email,
				usage: license.usageToday + 1, // Include current request
				usageLimit: dailyLimit,
			},
		};
	} catch (error) {
		if (error instanceof jwt.JsonWebTokenError) {
			return { valid: false, error: "Invalid license key format" };
		}
		if (error instanceof jwt.TokenExpiredError) {
			return { valid: false, error: "License key has expired" };
		}

		console.error("[License] Validation error:", error);
		return { valid: false, error: "License validation failed" };
	}
};


export const createLicense = async (
	email: string,
	unlimited: boolean = false,
): Promise<License> => {
	try {
		const key = generateLicenseKey(email);

		const features = ["basic_access"];
		const requestsPerDay = unlimited ? -1 : 100000;

		const metadata: LicenseMetadata = {
			features,
			limits: {
				requests_per_day: requestsPerDay,
			},
		};

		const license = await dbCreateLicense(key, email, metadata);

		return license;
	} catch (error) {
		console.error(`[License Service] Error creating license:`, error);

		// Handle specific database errors
		const errorMessage = error instanceof Error ? error.message : String(error);
		if (errorMessage.includes('duplicate key')) {
			throw new Error(`License already exists for email: ${email}`);
		} else if (errorMessage.includes('connection')) {
			throw new Error(
				"Database connection failed. Please check PostgreSQL container.",
			);
		}

		throw new Error(
			`Failed to create license: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
	}
};

export const deleteLicense = async (licenseId: string): Promise<boolean> => {
	return await dbDeleteLicense(licenseId);
};

export const getLicenseStats = async () => {
	return await dbGetLicenseStats();
};

export const listLicenses = async (): Promise<License[]> => {
	return await dbListLicenses();
};

export const getLicenseById = async (
	searchBy: "id" | "email" | "key",
	value: string,
): Promise<License | null> => {
	return await dbGetLicenseById(searchBy, value);
};

export const resetLicenseUsage = async (
	licenseId: string,
): Promise<boolean> => {
	return await dbResetLicenseUsage(licenseId);
};
