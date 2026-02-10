import type { InferSelectModel } from 'drizzle-orm';
import jwt from "jsonwebtoken";
import { nanoid } from "nanoid";
import { env } from "@/config/env.js";
import { licenses } from "@/db/schema.js";
import { createLicense as dbCreateLicense } from "@/db/license/create-license.js";

type License = InferSelectModel<typeof licenses>;
import { deleteLicense as dbDeleteLicense } from "@/db/license/delete-license.js";
import { getLicenseById as dbGetLicenseById } from "@/db/license/get-license-by-id.js";
import { listLicenses as dbListLicenses } from "@/db/license/list-licenses.js";
import { resetLicenseUsage as dbResetLicenseUsage } from "@/db/license/reset-license-usage.js";
import { checkAndResetDailyUsage } from "@/db/license/check-and-reset-daily-usage.js";
import { updateUsageStats } from "@/db/license/update-usage-stats.js";

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
		usage: number;
		usageLimit: number;
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
		// 1. Verify JWT signature and decode
		const decoded = jwt.verify(key, env.LICENSE_SECRET) as LicensePayload;

		// 2. Find license in database
		let license = await dbGetLicenseById('key', key);
		if (!license) {
			// Try to find by JWT subject (license ID) as fallback
			// If found by ID but not by key, it's still invalid (key mismatch)
			const licenseById = await dbGetLicenseById('id', decoded.sub);
			if (!licenseById) {
				return { valid: false, error: "License not found in database" };
			}
			return { valid: false, error: "License not found in database" };
		}

		// 3. Check and reset daily usage if needed
		await checkAndResetDailyUsage(license);
		
		// Refresh license data after potential reset
		license = await dbGetLicenseById('id', license.id);
		if (!license) {
			return { valid: false, error: "License not found after reset" };
		}

		// 6. Check daily rate limits (skip if unlimited)
		const dailyLimit = license.usageLimit;
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

		const usageLimit = unlimited ? -1 : 100000;

		const license = await dbCreateLicense(key, email, usageLimit);

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
