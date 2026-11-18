import { describe, expect, it } from 'bun:test';
import { isDashboardWebOrigin } from './dashboard-origin';

describe('isDashboardWebOrigin', () => {
    it('allows the deployed dashboard origins in production', () => {
        expect(isDashboardWebOrigin('https://merchbase.co', true)).toBe(true);
        expect(isDashboardWebOrigin('https://rankwrangler.merchbase.co', true)).toBe(true);
    });

    it('rejects an unrelated origin in production', () => {
        expect(isDashboardWebOrigin('https://evil.example.com', true)).toBe(false);
    });

    it('rejects an http loopback origin in production', () => {
        expect(isDashboardWebOrigin('http://127.0.0.1:21865', true)).toBe(false);
        expect(isDashboardWebOrigin('http://localhost:5173', true)).toBe(false);
    });

    it('allows an http loopback origin outside production', () => {
        expect(isDashboardWebOrigin('http://127.0.0.1:21865', false)).toBe(true);
        expect(isDashboardWebOrigin('http://localhost:5173', false)).toBe(true);
        expect(isDashboardWebOrigin('http://[::1]:5173', false)).toBe(true);
    });

    it('rejects an https loopback origin outside production', () => {
        expect(isDashboardWebOrigin('https://127.0.0.1:21865', false)).toBe(false);
    });

    it('rejects a malformed origin', () => {
        expect(isDashboardWebOrigin('not-a-url', false)).toBe(false);
    });
});
