import { describe, expect, it } from 'bun:test';
import { appRouter } from './router';
import { publicAppRouter } from './router-public';

describe('Catalog query API contract', () => {
    it('removes explicit keyword mutations while retaining activity reads', () => {
        const appProcedures = Object.keys(appRouter._def.procedures);
        const publicProcedures = Object.keys(publicAppRouter._def.procedures);

        expect(appProcedures).toContain('api.app.catalog.query.get');
        expect(appProcedures).toContain('api.app.catalog.query.list');
        expect(publicProcedures).toContain('api.public.catalog.query.get');
        expect(appProcedures).not.toContain('api.app.catalog.query.track');
        expect(appProcedures).not.toContain('api.app.catalog.query.untrack');
        expect(publicProcedures).not.toContain('api.public.catalog.query.track');
        expect(publicProcedures).not.toContain('api.public.catalog.query.untrack');
    });
});
