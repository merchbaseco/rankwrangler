import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

const caddyfile = readFileSync(new URL('../Caddyfile', import.meta.url), 'utf8');
const mcpPaths = [
    '/mcp',
    '/.well-known/oauth-protected-resource',
    '/.well-known/oauth-protected-resource/mcp',
    '/.well-known/oauth-authorization-server',
    '/.well-known/oauth-authorization-server/mcp',
];

describe('Caddy hosted MCP ingress', () => {
    it('routes only the Fastify MCP and OAuth discovery paths to the server', () => {
        const matcherLine = caddyfile
            .split('\n')
            .find(line => line.trim().startsWith('@mcp path '));
        const handlerLine = caddyfile.split('\n').find(line => line.trim() === 'handle @mcp {');

        expect(matcherLine?.trim()).toBe(`@mcp path ${mcpPaths.join(' ')}`);
        expect(matcherLine).not.toContain('*');
        expect(handlerLine).toBe('    handle @mcp {');

        const handlerStart = caddyfile.indexOf('    handle @mcp {');
        const handlerEnd = caddyfile.indexOf('    # Nginx health check endpoint', handlerStart);
        expect(caddyfile.slice(handlerStart, handlerEnd)).toContain('reverse_proxy server:8080');
    });
});
