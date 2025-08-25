# RankWrangler Admin CLI

Beautiful command-line interface for managing RankWrangler licenses.

## Features

🎨 **Beautiful Interface** - Colored output, tables, boxes, and ASCII art  
🔄 **Interactive Mode** - Arrow-key navigation and prompts  
⚡ **Quick Commands** - Non-interactive commands for automation  
🔒 **Secure** - Direct PostgreSQL connection with SSH tunneling  
📊 **Statistics** - Comprehensive license usage analytics  

## Installation

```bash
cd /Users/zknicker/Programming/tools/rankwrangler-cli
npm install
```

## Setup

✅ **No manual setup required!** The CLI automatically:
- Establishes SSH tunnel to the production server
- Connects to PostgreSQL database
- Handles all authentication with embedded SSH key

**Requirements:**
- Node.js 18+ 
- Network access to 5.161.181.165

## Usage

### Interactive Mode (Recommended)
```bash
node index.js
# or
npm start
```

The CLI will automatically:
1. Display the RankWrangler ASCII banner
2. Establish SSH tunnel if needed
3. Connect to PostgreSQL database
4. Launch the interactive menu

### Quick Commands
```bash
# Create license
node index.js create --email user@example.com --tier pro --days 365

# List licenses
node index.js list --active

# Show statistics
node index.js stats
```

## Menu Options

- 📊 **View Statistics** - License counts and usage analytics
- 📋 **List All Licenses** - Table view with filtering options
- 🔍 **View License Details** - Detailed license information
- ✨ **Create New License** - Interactive license creation
- 🚫 **Revoke License** - Revoke licenses with confirmation
- 🔄 **Reset Usage Counter** - Reset daily usage limits

## License Tiers

- **Basic**: 100 requests/day
- **Pro**: 1,000 requests/day

## Database Schema

The CLI creates and manages a `Licenses` table with the following fields:
- `id` (Primary Key)
- `key` (JWT License Key) 
- `email` (User Email)
- `tier` (basic/pro)
- `metadata` (JSON)
- `createdAt`, `expiresAt`, `revokedAt`
- `lastUsedAt`, `usageCount`, `usageToday`
- `lastResetAt`

## Security

- JWT tokens signed with production secret
- Direct PostgreSQL connection (no API dependency)
- SSH tunnel for secure remote access
- Confirmation prompts for destructive actions