import { ServiceAccessError, type ServiceAccessErrorCode } from '@merchbaseco/access';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';

export const RANKWRANGLER_MCP_SCOPES = ['openid', 'email', 'profile'] as const;
const BEARER_TOKEN_PATTERN = /^Bearer\s+(.+)$/i;

export interface McpAuthDependencies<Principal = unknown> {
    authorize(token: string): Promise<{
        merchbaseUserId: string;
        principal: Principal;
    }>;
}

export type McpAuthResult<Principal = unknown> =
    | {
          authInfo: AuthInfo;
          merchbaseUserId: string;
          principal: Principal;
          status: 'authenticated';
      }
    | {
          missingScopes: string[];
          status: 'forbidden';
      }
    | {
          status: 'unauthorized';
      }
    | {
          status: 'unavailable';
      };

export const authenticateMcpRequest = async <Principal = unknown>(
    authorization: string | string[] | undefined,
    dependencies: McpAuthDependencies<Principal> | null
): Promise<McpAuthResult<Principal>> => {
    if (!dependencies) {
        return { status: 'unavailable' };
    }

    const token = getBearerToken(authorization);
    if (!token) {
        return { status: 'unauthorized' };
    }

    try {
        const authorized = await dependencies.authorize(token);
        return {
            authInfo: {
                clientId: 'clerk',
                extra: {
                    merchbaseUserId: authorized.merchbaseUserId,
                },
                scopes: [...RANKWRANGLER_MCP_SCOPES],
                token,
            },
            merchbaseUserId: authorized.merchbaseUserId,
            principal: authorized.principal,
            status: 'authenticated',
        };
    } catch (error) {
        const code = toAccessErrorCode(error);
        if (code === 'insufficient_scope') {
            return {
                missingScopes: [...RANKWRANGLER_MCP_SCOPES],
                status: 'forbidden',
            };
        }
        if (code === 'access_unavailable') {
            return { status: 'unavailable' };
        }
        if (code === 'access_denied') {
            return { missingScopes: [], status: 'forbidden' };
        }
        if (code === 'unauthenticated') {
            return { status: 'unauthorized' };
        }
        return { status: 'unavailable' };
    }
};

const toAccessErrorCode = (error: unknown): ServiceAccessErrorCode | undefined =>
    error instanceof ServiceAccessError ? error.code : undefined;

const getBearerToken = (authorization: string | string[] | undefined) => {
    const value = Array.isArray(authorization) ? authorization[0] : authorization;
    const match = BEARER_TOKEN_PATTERN.exec(value?.trim() ?? '');
    return match?.[1]?.trim() || null;
};
