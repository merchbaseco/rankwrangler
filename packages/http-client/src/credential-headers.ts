export const credentialHeaders = (credential: string): Record<string, string> => {
    if (!credential.startsWith('mbk_v1.')) return { Authorization: `Bearer ${credential}` };
    try {
        if (credential.length > 2048) throw new Error();
        const encoded = credential.slice(7);
        if (!/^[A-Za-z0-9_-]+$/.test(encoded)) throw new Error();
        const decoded = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'));
        if (btoa(decoded).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') !== encoded) throw new Error();
        const parsed: unknown = JSON.parse(decoded);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.keys(parsed).length !== 2 || !('clientId' in parsed) || !('clientSecret' in parsed) ||
            typeof parsed.clientId !== 'string' || !/^[A-Za-z0-9._-]{1,256}$/.test(parsed.clientId) ||
            typeof parsed.clientSecret !== 'string' || !/^[A-Za-z0-9_-]{32,512}$/.test(parsed.clientSecret)) throw new Error();
        return { 'CF-Access-Client-Id': parsed.clientId, 'CF-Access-Client-Secret': parsed.clientSecret };
    } catch { throw new Error('Invalid Merchbase machine credential.'); }
};
