## Development Commands

**TypeScript Type Checking**:
- `cd packages/web-extension && npx tsc --noEmit` - Must be run from web-extension directory
- Verifies TypeScript types without emitting files
- Critical for catching type errors in content scripts, popup components, and service workers

## Component Architecture

### File Naming Convention
- Use kebab-case for component file names: "search-badge.tsx" instead of "SearchBadge.tsx"
- Use PascalCase for actual component names: "SearchBadge"

### License Display Patterns
Multi-tier license UI with adaptive display based limit types:

**Key Points:**
- **Unlimited Detection**: Checks `licenseData.dailyLimit === -1` to identify unlimited licenses
- **Usage Display**: Shows "X (Unlimited)" for unlimited vs "X/Y" for limited licenses
- **Badge System**: Green "Unlimited" badge for unlimited licenses, usage-percentage badges for limited
- **Graceful Degradation**: Handles missing license data and validation states
- **Responsive Layout**: License info components adapt to popup constraints

## Content Script Architecture

### Product Detection and Injection
Badge injection system uses Amazon's DOM structure and timing considerations:

**Key Points:**
- **Element Tracking**: Uses Amazon's `data-uuid` attributes instead of DOM object references for reliable duplicate handling
- **MutationObserver**: Located in `content/app.tsx` - watches for dynamic product additions during scrolling/pagination
- **SearchInjector**: Located in `content/services/search-injector.ts` - singleton service managing badge lifecycle
- **Injection Point**: Targets `[data-cy="title-recipe"]` parent element for consistent placement
- **Performance**: No artificial delays - badges inject immediately when products appear in DOM

### Browser Navigation Handling
Content script survives browser back/forward navigation using bfcache management:

**Key Points:**
- **Page Lifecycle**: `pagehide` event closes IndexedDB connections, `pageshow` reopens them
- **Component Reset**: `searchInjector.reset()` clears processed elements and React roots on back navigation
- **Query Invalidation**: React Query cache invalidated on page restore to refresh data
- **Critical Location**: All navigation logic centralized in `content/app.tsx` useEffect

### Performance Considerations
Badge rendering optimized for perceived performance and layout stability:

**Key Points:**
- **Rate Limiting**: 20 requests/second via `limiter` package in `api/get-product.ts`
- **Skeleton Loading**: Dimension-matched placeholder in `ProductDisplay` prevents layout shift
- **Shadow DOM**: Each badge uses shadow DOM for style isolation from Amazon's CSS
- **Caching**: 1-hour cache via IndexedDB in `db/product-cache.ts` reduces API calls
- **Progressive Enhancement**: FIFO processing ensures visible products get badges first