# RankWrangler Turborepo Architecture

## Overview
This document defines the target architecture for the RankWrangler turborepo, supporting multiple browser extensions with shared code and future CLI/server integration.

## Directory Structure

```
rankwrangler/
├── apps/                      # All deployable applications
│   ├── chrome-extension/      # Chrome/Edge/Brave extension
│   ├── safari-extension/      # Safari extension & app wrapper
│   ├── cli/                   # Future: rankwrangler-cli migration
│   └── server/                # Future: rankwrangler-server migration
│
├── packages/                  # Shared packages
│   ├── shared-extension/      # Shared extension logic (background, content scripts)
│   ├── ui/                    # Shared UI components (popup, settings)
│   ├── core/                  # Core business logic
│   ├── icons/                 # Icon generation (existing)
│   ├── config-typescript/     # Shared TypeScript configs
│   ├── config-eslint/         # Shared ESLint configs
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
- `@rankwrangler/chrome-extension`
- `@rankwrangler/safari-extension`
- `@rankwrangler/shared-extension`
- `@rankwrangler/ui`
- `@rankwrangler/core`
- `@rankwrangler/cli` (future)
- `@rankwrangler/server` (future)

## Build Pipeline

### Dependencies Flow
```
icons → shared-extension → chrome-extension
                        ↘
                          safari-extension

ui → chrome-extension
  ↘
    safari-extension

core → shared-extension
    ↘
      cli (future)
    ↘
      server (future)
```

### Turbo Tasks
- `build`: Builds all apps and packages in dependency order
- `dev`: Runs development mode with hot reload
- `lint`: Runs ESLint across all packages
- `type-check`: TypeScript validation
- `clean`: Removes all build artifacts

## Migration Phases

### Phase 1: Core Restructuring (Current)
1. Create `apps/` and new package structure
2. Move existing extension code to `apps/chrome-extension/`
3. Move Safari app to `apps/safari-extension/`
4. Extract shared code to `packages/shared-extension/`

### Phase 2: Shared Infrastructure
1. Create `packages/config-typescript/` and `packages/config-eslint/`
2. Extract UI components to `packages/ui/`
3. Create `packages/core/` for business logic
4. Update all apps to use shared packages

### Phase 3: Future Integrations
1. Migrate `rankwrangler-cli` from `Programming/tools/rankwrangler-cli/` to `apps/cli/`
2. Migrate `rankwrangler-server` from `Programming/tools/rankwrangler-server/` to `apps/server/`
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

### Adding a New Browser Extension
1. Create new app in `apps/[browser]-extension/`
2. Import shared packages (`@rankwrangler/shared-extension`, `@rankwrangler/ui`)
3. Add platform-specific manifest and build config
4. Register in root `package.json` workspaces
5. Add build tasks to `turbo.json`

### Modifying Shared Code
1. Make changes in relevant `packages/` directory
2. Run `turbo build` to verify all consumers still work
3. Test in both Chrome and Safari extensions
4. Shared changes automatically available to all apps

## Notes for Future CLI/Server Migration

When migrating the CLI and server:

1. **CLI Migration** (`Programming/tools/rankwrangler-cli/` → `apps/cli/`)
   - Maintain existing CLI interface
   - Extract shared logic to `packages/core/`
   - Use `packages/api-client/` for server communication

2. **Server Migration** (`Programming/tools/rankwrangler-server/` → `apps/server/`)
   - Keep existing API contracts
   - Share data models via `packages/core/`
   - Consider extracting database schemas to `packages/database/`

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