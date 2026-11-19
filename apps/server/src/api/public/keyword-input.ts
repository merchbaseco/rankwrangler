import { z } from 'zod';
import { keywordDirectoryInput } from '@/api/keyword-directory-input';

export const keywordGetInput = z.object({ keyword: z.string().trim().min(1).max(200) }).strict();
export const keywordListInput = keywordDirectoryInput
    .omit({ search: true })
    .extend({ term: z.string().trim().min(1).max(200) })
    .strict();
