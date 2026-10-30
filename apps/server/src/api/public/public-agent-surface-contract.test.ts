import { describe, expect, it } from 'bun:test';
import { publicAppRouter } from '@/api/router-public';

describe('public agent surface', () => {
    it('exposes only the final Product and keyword retrieval verbs', () => {
        const procedures = Object.keys(publicAppRouter._def.procedures);

        expect(procedures.sort()).toEqual(
            [
                'api.public.product.get',
                'api.public.product.getMany',
                'api.public.product.search',
                'api.public.product.history',
                'api.public.keyword.get',
                'api.public.keyword.results',
                'api.public.keyword.search',
            ].sort()
        );
    });

});
