import { expect, it } from 'bun:test';
import { appRouter } from '@/api/router';

it('exposes raw Provider attempts only through the admin app surface', () => {
    const procedures = Object.keys(appRouter._def.procedures);

    expect(procedures).toContain('api.app.providerTelemetry.get');
    expect(procedures).not.toContain('api.public.providerTelemetry.get');
});
