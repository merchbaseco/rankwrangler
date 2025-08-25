# RankWrangler Turborepo Architecture

## Overview
This document defines the target architecture for the RankWrangler turborepo, supporting multiple browser extensions with shared code and future CLI/server integration.

## Directory Structure

```
rankwrangler/
├── apps/                      # All deployable applications
│   ├── safari-extension/      # Safari extension & app wrapper
│   ├── server/                # RankWrangler server (migrated)
│   └── cli/                   # Future: rankwrangler-cli migration
│
├── packages/                  # Shared packages
│   ├── icons/                 # Icon generation
│   ├── web-extension/         # Web extension shared code
│   ├── shared-extension/      # Future: shared extension logic (background, content scripts)
│   ├── ui/                    # Future: shared UI components (popup, settings)
│   ├── core/                  # Future: core business logic
│   ├── config-typescript/     # Future: shared TypeScript configs
│   ├── config-eslint/         # Future: shared ESLint configs
│   └── api-client/            # Future: API client for server communication
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
- `@rankwrangler/icons`
- `@rankwrangler/web-extension`
- `@rankwrangler/shared-extension` (future)
- `@rankwrangler/ui` (future)
- `@rankwrangler/core` (future)
- `@rankwrangler/cli` (future)

## Build Pipeline

### Dependencies Flow
```
icons → web-extension → safari-extension

server (standalone, no dependencies)

Future:
core → shared-extension → chrome-extension
    ↘                  ↘
      cli                safari-extension
    ↘
      server
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

## Migration Phases

### Phase 1: Core Restructuring ✅ COMPLETED
1. ✅ Create `apps/` and new package structure
2. ✅ Move Safari app to `apps/safari-extension/`
3. ✅ Create `packages/icons/` and `packages/web-extension/`
4. ✅ **NEW**: Migrate `rankwrangler-server` to `apps/server/`

### Phase 2: Shared Infrastructure (Future)
1. Create `packages/config-typescript/` and `packages/config-eslint/`
2. Extract UI components to `packages/ui/`
3. Create `packages/core/` for business logic
4. Update all apps to use shared packages

### Phase 3: Future Integrations
1. Migrate `rankwrangler-cli` from `Programming/tools/rankwrangler-cli/` to `apps/cli/`
2. Create Chrome/Edge extension in `apps/chrome-extension/`
3. Create `packages/api-client/` for server communication
4. Ensure all apps can share core business logic

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

## Server Integration Notes

The RankWrangler server has been successfully migrated to `apps/server/`:
- Maintains all existing API contracts and functionality
- Uses Docker deployment with turborepo integration
- Deploy script handles copying yarn workspace files for Docker builds
- All server functionality preserved while gaining turborepo benefits

## Notes for Future CLI Migration

When migrating the CLI:
1. **CLI Migration** (`Programming/tools/rankwrangler-cli/` → `apps/cli/`)
   - Maintain existing CLI interface
   - Extract shared logic to `packages/core/`
   - Use `packages/api-client/` for server communication

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