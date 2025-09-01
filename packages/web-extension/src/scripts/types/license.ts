import z from 'zod';

export const LicenseSchema = z.object({
    key: z.string(),
    email: z.string(),
    isValid: z.boolean(),
    lastValidated: z.number(),
    usage: z.number().min(0),
    usageLimit: z.number().min(-1), // -1 for unlimited
});

export type License = z.infer<typeof LicenseSchema>;
