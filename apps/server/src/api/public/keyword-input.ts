import { z } from 'zod';
import { keywordDirectoryInput } from '@/api/keyword-directory-input';

export const keywordGetInput = z.object({ keyword: z.string().trim().min(1).max(200) }).strict();
export const keywordSearchInput = keywordDirectoryInput
    .omit({ search: true })
    .extend({ text: z.string().trim().min(1).max(200) })
    .strict();
