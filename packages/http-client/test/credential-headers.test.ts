import { expect, test } from 'bun:test';
import { credentialHeaders } from '../src/credential-headers';
const wire = 'mbk_v1.eyJjbGllbnRJZCI6ImNsaWVudC5hY2Nlc3MiLCJjbGllbnRTZWNyZXQiOiJhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhIn0';
test('decodes the versioned native machine protocol and forwards opaque OAuth unchanged', () => {
    expect(credentialHeaders(wire)).toEqual({ 'CF-Access-Client-Id': 'client.access', 'CF-Access-Client-Secret': 'a'.repeat(64) });
    expect(credentialHeaders('opaque-oauth')).toEqual({ Authorization: 'Bearer opaque-oauth' });
});
test('invalid machine envelopes never become bearer tokens or leak into errors', () => {
    for (const value of ['mbk_v1.private', wire+'=', 'mbk_v1.'+'a'.repeat(2049)]) {
        expect(() => credentialHeaders(value)).toThrow('Invalid Merchbase machine credential.');
    }
});
