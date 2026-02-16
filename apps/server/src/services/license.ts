import type { InferSelectModel } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import { nanoid } from 'nanoid';
import { env } from '@/config/env.js';
import { checkAndResetDailyUsage } from '@/db/license/check-and-reset-daily-usage.js';
import { consumeLicenseUsage as dbConsumeLicenseUsage } from '@/db/license/consume-license-usage.js';
import { createLicense as dbCreateLicense } from '@/db/license/create-license.js';
import { deleteLicense as dbDeleteLicense } from '@/db/license/delete-license.js';
import { getLicenseById as dbGetLicenseById } from '@/db/license/get-license-by-id.js';
import { listLicenses as dbListLicenses } from '@/db/license/list-licenses.js';
import { resetLicenseUsage as dbResetLicenseUsage } from '@/db/license/reset-license-usage.js';
import { licenses } from '@/db/schema.js';

type License = InferSelectModel<typeof licenses>;

export interface LicensePayload {
    sub: string;
    email: string;
    iat: number;
}

export interface LicenseUsageData {
    id: string;
    email: string;
    usage: number;
    usageLimit: number;
}

export interface ValidationResult {
    valid: boolean;
    error?: string;
    data?: LicenseUsageData;
}

export interface ConsumeUsageResult {
    success: boolean;
    error?: string;
    data?: LicenseUsageData;
}

export const generateLicenseKey = (email: string): string => {
    const licenseId = nanoid(12);
    const payload: LicensePayload = {
        sub: licenseId,
        email,
        iat: Math.floor(Date.now() / 1000),
    };

    return jwt.sign(payload, env.LICENSE_SECRET);
};

export const validateLicense = async (key: string): Promise<ValidationResult> => {
    try {
        const decoded = jwt.verify(key, env.LICENSE_SECRET) as LicensePayload;

        let license = await dbGetLicenseById('key', key);
        if (!license) {
            const licenseById = await dbGetLicenseById('id', decoded.sub);
            if (!licenseById) {
                return { valid: false, error: 'License not found in database' };
            }
            return { valid: false, error: 'License not found in database' };
        }

        await checkAndResetDailyUsage(license);

        license = await dbGetLicenseById('id', license.id);
        if (!license) {
            return { valid: false, error: 'License not found after reset' };
        }

        return {
            valid: true,
            data: {
                id: license.id,
                email: license.email,
                usage: license.usageToday,
                usageLimit: license.usageLimit,
            },
        };
    } catch (error) {
        if (error instanceof jwt.JsonWebTokenError) {
            return { valid: false, error: 'Invalid license key format' };
        }
        if (error instanceof jwt.TokenExpiredError) {
            return { valid: false, error: 'License key has expired' };
        }

        console.error('[License] Validation error:', error);
        return { valid: false, error: 'License validation failed' };
    }
};

export const consumeLicenseUsage = async (
    licenseId: string,
    amount = 1
): Promise<ConsumeUsageResult> => {
    try {
        const usageAmount = Number.isInteger(amount) ? amount : 0;
        if (usageAmount < 1) {
            return {
                success: true,
            };
        }

        let license = await dbGetLicenseById('id', licenseId);
        if (!license) {
            return { success: false, error: 'License not found in database' };
        }

        await checkAndResetDailyUsage(license);

        license = await dbGetLicenseById('id', license.id);
        if (!license) {
            return { success: false, error: 'License not found after reset' };
        }

        if (license.usageLimit !== -1 && license.usageToday + usageAmount > license.usageLimit) {
            return {
                success: false,
                error: `Daily limit of ${license.usageLimit} requests exceeded. Resets at midnight UTC.`,
            };
        }

        const consumedLicense = await dbConsumeLicenseUsage(
            license.id,
            usageAmount,
            license.usageLimit
        );

        if (!consumedLicense) {
            const latestLicense = await dbGetLicenseById('id', license.id);
            if (
                latestLicense &&
                latestLicense.usageLimit !== -1 &&
                latestLicense.usageToday + usageAmount > latestLicense.usageLimit
            ) {
                return {
                    success: false,
                    error: `Daily limit of ${latestLicense.usageLimit} requests exceeded. Resets at midnight UTC.`,
                };
            }

            return {
                success: false,
                error: 'Failed to update license usage',
            };
        }

        return {
            success: true,
            data: {
                id: consumedLicense.id,
                email: consumedLicense.email,
                usage: consumedLicense.usageToday,
                usageLimit: consumedLicense.usageLimit,
            },
        };
    } catch (error) {
        console.error('[License] Usage consumption error:', error);
        return { success: false, error: 'License usage consumption failed' };
    }
};

export const createLicense = async (email: string, unlimited = false): Promise<License> => {
    try {
        const key = generateLicenseKey(email);
        const usageLimit = unlimited ? -1 : 100000;
        return await dbCreateLicense(key, email, usageLimit);
    } catch (error) {
        console.error('[License Service] Error creating license:', error);

        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('duplicate key')) {
            throw new Error(`License already exists for email: ${email}`);
        }
        if (errorMessage.includes('connection')) {
            throw new Error('Database connection failed. Please check PostgreSQL container.');
        }

        throw new Error(
            `Failed to create license: ${error instanceof Error ? error.message : 'Unknown error'}`
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
    searchBy: 'id' | 'email' | 'key',
    value: string
): Promise<License | null> => {
    return await dbGetLicenseById(searchBy, value);
};

export const resetLicenseUsage = async (licenseId: string): Promise<boolean> => {
    return await dbResetLicenseUsage(licenseId);
};
