# RankWrangler CLI

## Overview
Interactive React-based CLI for RankWrangler license management using Ink framework. Provides admin interface for creating, viewing, and managing user licenses with real-time server communication.

## Architecture

### Framework Choice
- **Ink + React**: Enables complex interactive UI patterns in terminal
- **TypeScript**: Full type safety for API communication and state management
- **Biome**: Code formatting and linting (note: potential conflict with root biome.json)

### Key Components
- `src/index.tsx` - Main application with screen routing and API client
- Multi-step license creation workflow with navigation state management
- Real-time server integration for license operations and validation
- Clipboard integration for license key management

### License Creation Flow
Two-step interactive process with navigation controls:

**Key Points:**
- **Step 1**: Email validation with regex checking
- **Step 2**: Usage limit selection (Standard 10k/day vs Unlimited) and license generation
- **Navigation**: Full bi-directional flow with arrow key controls
- **Error Handling**: Inline validation with user-friendly error messages
- **Permanent Licenses**: All licenses are created without expiration and remain valid until explicitly deleted

### API Integration Pattern
Direct server communication using fetch with structured error handling:

**Key Points:**
- **Base URL**: Hard-coded to `https://merchbase.co/api` for production server
- **Authentication**: Admin key embedded for license management operations
- **Request/Response**: JSON-based with success/error structure matching server API
- **Debug Logging**: Comprehensive request/response logging for troubleshooting
- **Error Recovery**: Graceful handling of network failures and API errors
- **Delete Operations**: Uses permanent deletion (`/api/admin/license/delete`) - no soft delete or revoke functionality

### State Management Architecture
Component-based state with hooks for complex multi-step flows:

**Key Points:**
- **Screen Routing**: Single state machine for dashboard/licenses/create flows
- **Form State**: Separate state management for each input step with validation
- **Navigation State**: Tracks current step and enables backward navigation
- **Message State**: Temporary success/error message display with auto-clearing
- **Refresh Triggers**: State-based data refresh coordination between screens

### UI Layout Architecture
Conditional rendering pattern to prevent layout shifts during state changes:

**Key Points:**
- **Layout Stability**: Uses exclusive conditional rendering (`{!showModal ? <Table /> : <Modal />}`) instead of overlays
- **No Layout Shifts**: Critical for terminal UI - prevents jarring visual changes during confirmations
- **Modal Pattern**: Replace entire view content during confirmation flows rather than showing both simultaneously
- **State Isolation**: Each view state completely replaces previous content to maintain consistent positioning

## Development Notes

### Linting and Build Commands
Critical commands that must be run from the CLI directory (`apps/cli/`):

**Key Points:**
- **Linting**: `yarn lint` - Check for issues, `yarn lint --write` - Auto-fix formatting issues
- **TypeScript Type Checking**: `npx tsc --noEmit` - Verify types without emitting files (may show Ink component prop warnings)
- **Directory Context**: All commands must be run from `apps/cli/` directory, not turborepo root
- **Common Mistakes**: Don't use turborepo commands for CLI linting - Biome config is local to CLI package
- **Auto-Fix Strategy**: Always use `yarn lint --write` to fix formatting issues rather than manual fixes
- **Error Pattern**: "useless React fragment" and unused variables are common - auto-fix handles most cases

### Linting Configuration
- Uses Biome for fast formatting and linting
- May conflict with root-level biome.json configuration
- Local biome.json in CLI directory takes precedence over root configuration

### Testing Approach  
- Manual testing through interactive CLI flows
- Server integration testing via embedded test functions
- Live API validation with real license creation/validation cycles