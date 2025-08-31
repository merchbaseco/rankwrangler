# RankWrangler Turborepo Architecture

## Overview
This document defines the target architecture for the RankWrangler turborepo, supporting multiple browser extensions with shared code and future CLI/server integration.

## Directory Structure

```
rankwrangler/
├── apps/                      # All deployable applications
│   ├── safari-extension/      # Safari extension & app wrapper
│   ├── server/                # RankWrangler server
│   └── cli/                   # RankWrangler CLI
│
├── packages/                  # Shared packages
│   ├── icons/                 # Icon generation
│   └── web-extension/         # Web extension shared code
│
├── turbo.json                 # Turborepo configuration
├── package.json               # Root workspace configuration
└── scripts/                   # Build & utility scripts
```

## Key Principles

### 1. Clear Separation of Concerns
- **apps/**: Contains only deployable applications
- **packages/**: Contains shared, reusable code
- Each package has a single, well-defined responsibility

### 2. Browser Extension Architecture
- **Shared code**: Common extension logic lives in `packages/shared-extension/`
- **Platform-specific**: Each browser gets its own app directory with:
  - Platform-specific manifest.json
  - Custom build configuration
  - Browser-specific APIs or polyfills

### 3. Code Sharing Strategy
- **shared-extension/**: Background scripts, content scripts, messaging logic
- **ui/**: React/HTML components for popup and settings pages
- **core/**: Business logic, data models, utilities
- **icons/**: Centralized icon generation for all platforms

### 4. Configuration Management
- Shared TypeScript configs extend from `packages/config-typescript/`
- Shared ESLint rules in `packages/config-eslint/`
- Each app can override with specific needs

## Package Naming Convention
All packages follow the `@rankwrangler/[name]` convention:
- `@rankwrangler/safari-extension`
- `@rankwrangler/server`
- `@rankwrangler/cli`
- `@rankwrangler/icons`
- `@rankwrangler/web-extension`

## Build Pipeline

### Dependencies Flow
```
icons → web-extension → safari-extension

server (standalone, no dependencies)
cli (standalone, no dependencies)
```

### Turbo Tasks
**Note**: No generic `build` task exists - you must always specify what to build.

**Convenience Scripts (from root)**:
- `yarn build:server` - Build the server
- `yarn build:safari` - Build the Safari extension 
- `yarn deploy:server` - Deploy the server

**Individual Package Tasks**:
- `@rankwrangler/icons#build` - Generate icons
- `@rankwrangler/web-extension#build` - Build web extension
- `@rankwrangler/safari-extension#build` - Build Safari extension
- `@rankwrangler/server#build` - Build server
- `@rankwrangler/server#type-check` - Type check server
- `@rankwrangler/server#start` - Start server (requires build)
- `@rankwrangler/server#deploy` - Deploy server (requires build)

**Global Tasks**:
- `lint`: Runs linting across all packages
- `format`: Format code across all packages  
- `clean`: Removes all build artifacts

**CRITICAL: Package-Specific Commands**:
- **CLI Linting**: Must be run from `apps/cli/` directory using `yarn lint` or `yarn lint --write`
- **Server Operations**: Use turborepo commands from root (`yarn build:server`, `yarn deploy:server`)
- **Never mix contexts**: Don't use turborepo commands for CLI linting or local CLI commands for server operations

## Future Expansion

### Potential Shared Infrastructure
- `packages/config-typescript/` and `packages/config-eslint/` for unified configuration
- `packages/ui/` for shared React components across extensions
- `packages/core/` for business logic shared between CLI, server, and extensions
- `packages/api-client/` for standardized server communication

### Potential New Applications
- Chrome/Edge extension in `apps/chrome-extension/`
- Additional platform-specific extensions as needed

## Benefits

1. **Maintainability**: Single source of truth for shared logic
2. **Scalability**: Easy to add new browser extensions or platforms
3. **Type Safety**: Shared TypeScript configs ensure consistency
4. **Development Speed**: Changes to shared packages automatically propagate
5. **Testing**: Centralized testing of core logic
6. **Future-Ready**: Clean integration points for CLI and server

## Development Workflow

### Building and Deploying
**Always use specific build commands - never generic `build`:**

```bash
# Use convenience scripts from root
yarn build:server
yarn build:safari
yarn deploy:server

# Or use turbo directly with filters
turbo build --filter=@rankwrangler/server
turbo deploy --filter=@rankwrangler/server
```

**Never use `yarn workspace` - always use Turborepo features.**

### Adding a New App
1. Create new app in `apps/[app-name]/`
2. Create `package.json` with `@rankwrangler/[app-name]` name
3. Add to root `package.json` workspaces (already includes `apps/*`)
4. Add specific build tasks to `turbo.json`
5. Add convenience script to root `package.json` if commonly used

### Modifying Shared Code
1. Make changes in relevant `packages/` directory
2. Run specific build commands to verify consumers still work
3. Test affected apps individually
4. Shared changes automatically available to all apps

## Current Applications

### Server (`apps/server/`)
Docker-deployable Node.js service providing Amazon SP-API functionality:
- Fastify web server with license validation system
- PostgreSQL database with Drizzle ORM
- Docker deployment with turborepo integration
- Production deployment at `https://merchbase.co/api`

### CLI (`apps/cli/`)
React-based interactive terminal application for license management:
- Ink framework for terminal UI components
- Multi-step license creation and management workflows  
- Direct server API integration for license operations
- Biome linting with package-specific configuration

### Safari Extension (`apps/safari-extension/`)
macOS Safari extension with web extension components:
- Uses shared web extension code from `packages/web-extension/`
- Native macOS app wrapper for Safari extension delivery
- Icon generation from `packages/icons/`

## Testing Strategy

- Unit tests in each package's directory
- Integration tests in `apps/` directories
- E2E tests at root level testing full user flows
- Shared test utilities in `packages/test-utils/` (future)

## CI/CD Considerations

- Build and test all affected packages on PR
- Separate release pipelines for each app
- Version packages independently with changesets
- Automated dependency updates between packages
- We never use yarn workspace. We always use turborepo features instead.
- USE YARN
- we use yarn to execute build targets in package.json