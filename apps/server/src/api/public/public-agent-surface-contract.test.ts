import { describe, expect, it } from 'bun:test';
import { appRouter } from '@/api/router';
import { publicAppRouter } from '@/api/router-public';

describe('public agent surface', () => {
    it('exposes only the final Product and keyword retrieval verbs', () => {
        const procedures = Object.keys(publicAppRouter._def.procedures);

        expect(procedures.sort()).toEqual(
            [
                'api.public.product.get',
                'api.public.product.search',
                'api.public.product.history',
                'api.public.keyword.get',
                'api.public.keyword.search',
                'api.public.keyword.history',
            ].sort()
        );
    });

    it('keeps localhost sign-in automation outside the publishable router', () => {
        const appProcedures = Object.keys(appRouter._def.procedures);
        const publicProcedures = Object.keys(publicAppRouter._def.procedures);

        expect(appProcedures).toContain('api.dev.createClerkSignInToken');
        expect(publicProcedures).not.toContain('api.dev.createClerkSignInToken');
        expect(publicProcedures).not.toContain('api.public.dev.createClerkSignInToken');
    });
});
