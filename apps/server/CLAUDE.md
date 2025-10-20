# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RankWrangler Server is a Docker-deployable Node.js service that provides Amazon SP-API catalog search functionality. The service is designed to run as a Fastify server and is deployed to `merchbase.co/api/searchCatalog`.

**Part of RankWrangler Turborepo**: This server is located at `apps/server/` within the RankWrangler monorepo and is built/deployed using Turborepo for optimal caching and task orchestration.

## Development Commands

**From turborepo root** (recommended):
- `yarn build:server` - Build the server
- `yarn deploy:server` - Deploy the server
- `turbo build --filter=@rankwrangler/server` - Build server with turbo
- `turbo type-check --filter=@rankwrangler/server` - Type check server
- `turbo start --filter=@rankwrangler/server` - Start server (requires build first)
- `turbo deploy --filter=@rankwrangler/server` - Deploy server

**From this directory** (apps/server/):
- `yarn build` - Build for production using Vite
- `yarn start` - Start the production server (requires build first)
- `yarn type-check` - Run TypeScript type checking without emitting files
- `yarn deploy` - Deploy server (runs through turborepo)
- `yarn deploy:stack` - Deploy complete stack (Caddy + PostgreSQL + Server)
- `yarn deploy:stack --fresh` - Fresh stack deployment (wipes database)

## Architecture

### Stack Architecture
Self-contained Docker stack with external server-level reverse proxy:

```
External Server-level Caddy (managed separately)
    ↓ routes merchbase.co/api/* to port 8090
Stack Caddy (port 8090) ← → PostgreSQL (persistent data)
    ↓ internal routing
RankWrangler Server (port 8080)
```

**Note**: Server-level Caddy configuration is now managed in the separate `server-config` repository.

### Core Structure
- **Framework**: Fastify web server with TypeScript
- **Reverse Proxy**: Caddy with automatic HTTPS and health checks
- **Database**: PostgreSQL with Drizzle ORM migrations
- **Build Tool**: Vite configured for Node.js library builds with ES modules
- **Environment**: Type-safe environment variables using @t3-oss/env-core and Zod
- **Path Aliases**: Uses `@/` prefix for `src/` directory imports

### Key Components
- `src/index.ts` - Main Fastify server with health check, searchCatalog, and getProductInfo endpoints
- `src/services/spapi.ts` - Amazon SP-API integration with pagination, data parsing, and PostgreSQL caching
- `src/services/license.ts` - License management and system statistics aggregation
- `src/db/schema.ts` - Drizzle ORM schema definitions for PostgreSQL tables
- `src/config/env.ts` - Environment variable validation and typing
- `src/types/index.ts` - TypeScript type definitions for API responses

### API Architecture
- **Search endpoint**: `POST /api/searchCatalog` accepts keywords array and returns Amazon catalog items (not cached)
- **Product Info endpoint**: `GET /api/getProductInfo` fetches individual ASIN details with 12-hour PostgreSQL caching
- **License endpoints**: `/api/admin/license/*` for license management and system stats
- **Health check**: `GET /api/health` returns service status (note: under /api prefix)
- Built-in CORS for merchbase.co, localhost:3000, and localhost:5173
- Error handling with structured JSON responses
- All API endpoints use `/api/*` prefix for consistent routing through Caddy

### SP-API Integration
- Searches Amazon catalog with pagination (max 5 pages, 20 items per page)
- Targets US marketplace (ATVPDKIKX0DER) and Clothing classification (7147445011)
- Deduplicates results by title and sorts by Best Seller Rank (BSR)
- Filters out standard Merch by Amazon bullet points
- Returns simplified catalog items with ASIN, title, brand, bullets, image URL, and BSR
- **BSR Handling**: Products with null/undefined BSR are set to `null` (not filtered out) and sorted to end of results using `Number.MAX_SAFE_INTEGER` fallback

## Turborepo Integration

### Package Details
- **Name**: `@rankwrangler/server`
- **Location**: `apps/server/` within the RankWrangler monorepo
- **Dependencies**: Standalone - no internal package dependencies

### Turborepo Benefits
- **Caching**: Build outputs cached based on source code changes
- **Task orchestration**: Proper build dependencies and parallel execution
- **Convenience scripts**: Root-level shortcuts for common operations

### Build Process
- Server builds independently (no dependencies on other packages)
- Docker builds handled specially to copy yarn workspace files from turborepo root
- Deploy script automatically copies `yarn.lock` and `.yarnrc.yml` before Docker build

## Environment Variables

Required for SP-API access:
- `SPAPI_REFRESH_TOKEN` - Amazon SP-API refresh token
- `SPAPI_CLIENT_ID` - Amazon SP-API client ID  
- `SPAPI_APP_CLIENT_SECRET` - Amazon SP-API client secret
- `PORT` - Server port (defaults to 8080)

## Deployment

### Stack Deployment (Recommended)
Complete Docker stack with Caddy, PostgreSQL, and server:
```bash
# Deploy stack (preserves database)
yarn deploy:stack

# Fresh deployment (interactive, wipes database)
./scripts/deploy-stack.sh --fresh
```

Stack includes:
- **Caddy**: Internal reverse proxy on port 8090
- **PostgreSQL**: Persistent database with automatic migrations
- **Server**: RankWrangler API service
- **Networks**: Internal communication + external webserver network

### Server-Only Deployment
For quick updates without touching proxy/database:
```bash
yarn deploy:server
```

### Deployment Process
1. **Turborepo integration**: Deploy script copies `yarn.lock` and `.yarnrc.yml` from turborepo root before Docker build
2. **Docker build**: Uses `--progress=plain` for clean output in turborepo (non-interactive mode)
3. **File transfer**: Uses SCP with MD5 checksum verification for reliable transfers
4. **Network**: Automatically connects to `webserver` Docker network via docker-compose.yml
5. **Health checks**: Uses `/api/health` endpoint (not `/health`)
6. **Cleanup**: Removes copied yarn files after Docker build completes

**Run via turborepo**: `yarn deploy:server` or `turbo deploy --filter=@rankwrangler/server`

### Available Endpoints (Production)
- **Health**: `https://merchbase.co/api/health`
- **Search**: `https://merchbase.co/api/searchCatalog` (POST with JSON body: `{"keywords": ["search", "terms"]}`)
- **Direct stack access**: `http://5.161.181.165:8090/api/*` (for debugging)
- **Management**: `https://portainer.merchbase.co` (Portainer UI)

## Build Configuration

### Vite Configuration
- **IMPORTANT**: Uses SSR build mode (`ssr: true`) instead of library mode
- Targets Node.js 18+ with ES modules
- External dependencies (not bundled): fastify, @fastify/cors, @fastify/helmet, amazon-sp-api
- No minification for easier debugging
- TypeScript with strict mode and bundler module resolution

### Yarn Configuration  
- **CRITICAL**: Uses turborepo root `.yarnrc.yml` with `nodeLinker: node-modules` (not Yarn PnP)
- This is required for Docker compatibility - Yarn PnP causes module resolution issues in containers
- Deploy script copies yarn configuration from turborepo root for Docker builds
- Server directory should NOT have its own `node_modules` or `yarn.lock` (conflicts with turborepo)

### Docker Stack Configuration
- **Stack network**: Internal communication between Caddy, PostgreSQL, and server
- **Webserver network**: External communication with server-level Caddy
- **Volumes**: Persistent PostgreSQL data and Caddy certificates
- **Health checks**: All services monitored with automatic restarts

## Proxy Configuration

### Server-Level Caddy
Located at `~/caddy-proxy/` on server:
- **Automatic SSL**: Let's Encrypt certificates for merchbase.co domains
- **Domain routing**: Routes `/api/*` to stack Caddy on port 8090
- **Portainer access**: `portainer.merchbase.co` → Portainer container

### Stack Caddy  
Located at `~/merchbase-infra/stack/rankwrangler/Caddyfile`:
- **Internal routing**: Routes `/api/*` to server on port 8080
- **Health endpoints**: `/caddy-health`, `/nginx-health` (legacy)
- **Rate limiting**: Built-in request throttling

## Data Architecture

### PostgreSQL Database (Drizzle ORM)
- **Product Cache Table**: 12-hour TTL cache for individual product info (ASIN-specific)
- **System Stats Table**: Single-row counters for SP-API calls, cache hits, and cache size
- **License Tables**: User license management and validation

### Dual Caching Architecture
1. **Server-side (PostgreSQL)**: 12-hour cache for `getProductInfo` API calls
2. **Client-side (Browser Extension)**: 12-hour cache in `chrome.storage.local` with `bsrCache` key
3. **No caching** for `searchCatalog` results (ephemeral search data)

### Stats Tracking Behavior
- **SP-API Call Counter**: Incremented for both `searchCatalog` (up to 5 calls per search) and `getProductInfo` calls
- **Products in Cache**: Live count of non-expired PostgreSQL cache entries
- **Why SP-API calls > cached products**: `searchCatalog` makes API calls without caching results
- **Cache Hit Counter**: Only incremented when serving from PostgreSQL cache (not browser cache)

### Cache Lifecycle
- **Write Strategy**: `onConflictDoUpdate` overwrites existing cache entries on duplicate ASIN requests
- **Expiry Handling**: Products older than 12 hours trigger fresh SP-API calls and cache updates
- **Failure Handling**: Cache write failures are logged but don't prevent API responses

## Common Issues & Solutions

### Build Issues
- **Problem**: "Cannot find package 'fastify'" in Docker
- **Solution**: Ensure external dependencies in vite.config.ts and proper node_modules setup

### Deployment Issues  
- **Problem**: rsync verification failures
- **Solution**: Use SCP deployment method with MD5 checksum verification (deploy.sh)

### Network Issues
- **Problem**: 502 Bad Gateway for API calls
- **Solution**: Ensure container is on webserver network and Nginx routes /api/* correctly

### Stats Discrepancies
- **Problem**: SP-API calls exceed cached products count
- **Solution**: Expected behavior - `searchCatalog` makes uncached API calls, `getProductInfo` uses caching
- **Migration Required**: Run `yarn drizzle-kit generate` and deploy after schema changes

### Turborepo Integration Issues
- **Problem**: Docker build fails with "yarn.lock not found" after migration
- **Solution**: Deploy script copies `yarn.lock` and `.yarnrc.yml` from turborepo root before Docker build
- **Problem**: Local `node_modules` conflicts with turborepo workspace
- **Solution**: Remove any `node_modules` or `yarn.lock` from server directory - use turborepo root only
- **Problem**: Docker build output is spammy when run through Turborepo
- **Solution**: Use `--progress=plain` flag for non-interactive Docker builds

## Development Notes
- I will always run deploy for you unless I ask.
- I will built the extension for you unless I ask explciitly for you to do it.
