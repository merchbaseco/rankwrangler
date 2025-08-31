## Component Architecture

### File Naming Convention
- Use kebab-case for component file names: "search-badge.tsx" instead of "SearchBadge.tsx"
- Use PascalCase for actual component names: "SearchBadge"

### License Display Patterns
Multi-tier license UI with adaptive display based on limit types:

**Key Points:**
- **Unlimited Detection**: Checks `licenseData.dailyLimit === -1` to identify unlimited licenses
- **Usage Display**: Shows "X (Unlimited)" for unlimited vs "X/Y" for limited licenses
- **Badge System**: Green "Unlimited" badge for unlimited licenses, usage-percentage badges for limited
- **Graceful Degradation**: Handles missing license data and validation states
- **Responsive Layout**: License info components adapt to popup constraints