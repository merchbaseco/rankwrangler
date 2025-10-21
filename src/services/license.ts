import jwt from "jsonwebtoken";
import { nanoid } from "nanoid";
import { eq, lt, lte, gt, ne, isNull, and, gte } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { env } from "@/config/env.js";
import { db } from "@/db/index.js";
import { licenses, productCache, systemStats, type License, type LicenseMetadata } from "@/db/schema.js";

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
		const [license] = await db.select().from(licenses).where(eq(licenses.key, key));
		console.log('[License Validation] License query result:', JSON.stringify(license));
		if (!license) {
			console.log(
				`[License Validation] License not found in database for key: ${key.substring(0, 20)}...`,
			);

			// Try to find by JWT subject (license ID)
			console.log(`[License Validation] Trying to find by ID: ${decoded.sub}`);
			const [licenseById] = await db.select().from(licenses).where(eq(licenses.id, decoded.sub));

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

const checkAndResetDailyUsage = async (license: License): Promise<void> => {
	const now = new Date();
	const lastReset = new Date(license.lastResetAt);

	// Check if it's a new day (UTC)
	const isNewDay =
		now.getUTCDate() !== lastReset.getUTCDate() ||
		now.getUTCMonth() !== lastReset.getUTCMonth() ||
		now.getUTCFullYear() !== lastReset.getUTCFullYear();

	if (isNewDay) {
		await db.update(licenses)
			.set({
				usageToday: 0,
				lastResetAt: now,
			})
			.where(eq(licenses.id, license.id));
	}
};

const updateUsageStats = async (license: License): Promise<void> => {
	// Increment usage counters and update last used timestamp
	await db.update(licenses)
		.set({
			usageCount: sql`${licenses.usageCount} + 1`,
			usageToday: sql`${licenses.usageToday} + 1`,
			lastUsedAt: new Date()
		})
		.where(eq(licenses.id, license.id));
};

export const createLicense = async (
	email: string,
	unlimited: boolean = false,
): Promise<License> => {
	try {
		const key = generateLicenseKey(email);

		const features = ["basic_access"];
		const requestsPerDay = unlimited ? -1 : 100000;

		const licenseData = {
			key,
			email,
			metadata: {
				features,
				limits: {
					requests_per_day: requestsPerDay,
				},
			} as LicenseMetadata,
			usageCount: 0,
			usageToday: 0,
			lastResetAt: new Date(),
		};

		const [license] = await db.insert(licenses).values(licenseData).returning();

		console.log(`[License Service] License created:`, {
			id: license.id,
			hasKey: !!license.key,
			keyLength: license.key ? license.key.length : 0,
		});

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
	const result = await db.delete(licenses)
		.where(eq(licenses.id, licenseId))
		.returning({ id: licenses.id });

	return result.length > 0;
};

export const getLicenseStats = async () => {
	const [totalCount] = await db.select({ count: sql<number>`count(*)` }).from(licenses);

	const total = totalCount.count;

	// Get products in cache count (live count)
	const [cacheCount] = await db.select({ 
		count: sql<number>`count(*)` 
	})
	.from(productCache)
	.where(gte(productCache.expiresAt, new Date()));

	// Get system stats (counters)
	const [stats] = await db.select()
		.from(systemStats)
		.where(eq(systemStats.id, 'current'))
		.limit(1);

	return {
		total,
		productsInCache: cacheCount.count,
		recentApiCalls: stats?.totalSpApiCalls || 0,
		totalCacheHits: stats?.totalCacheHits || 0
	};
};

export const listLicenses = async (): Promise<License[]> => {
	return await db.select()
		.from(licenses)
		.orderBy(sql`${licenses.createdAt} DESC`);
};

export const getLicenseById = async (
	searchBy: "id" | "email" | "key",
	value: string,
): Promise<License | null> => {
	let whereClause;

	switch (searchBy) {
		case "id":
			whereClause = eq(licenses.id, value); // UUID, not parseInt
			break;
		case "email":
			whereClause = eq(licenses.email, value);
			break;
		case "key":
			whereClause = eq(licenses.key, value);
			break;
		default:
			throw new Error("Invalid search type");
	}

	const results = await db.select()
		.from(licenses)
		.where(whereClause)
		.orderBy(sql`${licenses.createdAt} DESC`)
		.limit(1);

	return results[0] || null;
};

export const resetLicenseUsage = async (
	licenseId: string,
): Promise<boolean> => {
	const result = await db.update(licenses)
		.set({
			usageToday: 0,
			lastResetAt: new Date(),
		})
		.where(eq(licenses.id, licenseId))
		.returning({ id: licenses.id });

	return result.length > 0;
};

export const updateLicenseLimit = async (
	licenseId: string,
	requestsPerDay: number,
): Promise<boolean> => {
	const [license] = await db.select()
		.from(licenses)
		.where(eq(licenses.id, licenseId))
		.limit(1);

	if (!license) {
		return false;
	}

	const updatedMetadata: LicenseMetadata = {
		...license.metadata,
		limits: {
			...license.metadata.limits,
			requests_per_day: requestsPerDay,
		},
	};

	const result = await db.update(licenses)
		.set({
			metadata: updatedMetadata,
		})
		.where(eq(licenses.id, licenseId))
		.returning({ id: licenses.id });

	return result.length > 0;
};
