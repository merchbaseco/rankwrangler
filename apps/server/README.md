# RankWrangler Server

A Docker-deployable Node.js service for Amazon SP-API catalog search functionality, designed to run at `merchbase.co/api/searchCatalog`.

## Features

- 🚀 Express.js server with TypeScript
- 🔍 Amazon SP-API catalog search integration
- 🐳 Docker containerization for easy deployment
- 🛡️ Security headers and CORS configuration
- 📊 Health check endpoint
- ⚡ Built with Vite for optimized production builds
- 🧶 Latest Yarn package manager

## Quick Start

### Prerequisites

- Node.js 18+
- Yarn 4.0+
- Docker (for containerized deployment)
- Amazon SP-API credentials

### Development

1. **Clone and install dependencies:**
   ```bash
   cd /Users/zknicker/Programming/tools/rankwrangler-server
   yarn install
   ```

2. **Set up environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your SP-API credentials
   ```

3. **Start development server:**
   ```bash
   yarn dev
   ```

### Production Build

```bash
yarn build
yarn start
```

### Production Deployment (Hetzner Server)

### Prerequisites
- Access to Hetzner server (5.161.181.165)
- SSH key configured
- Nginx Proxy Manager running on server
- SP-API credentials

### Deployment Steps

1. **First Time Setup:**
   ```bash
   # Run initial setup
   ./setup.sh
   
   # Configure your SP-API credentials
   cp .env.example .env.production
   # Edit .env.production with your actual SP-API credentials
   ```

2. **Deploy to Server:**
   ```bash
   ./deploy.sh
   ```

3. **Configure Nginx Proxy Manager:**
   - Access Nginx Proxy Manager: `http://5.161.181.165:81`
   - Add new Proxy Host:
     - Domain: `merchbase.co`
     - Forward IP: `172.17.0.1` (Docker host)
     - Forward Port: `8081`
     - Custom Location: `/api/searchCatalog`
   - Enable SSL with Let's Encrypt

4. **Test Deployment:**
   ```bash
   ./commands.sh test
   ```

### Management Commands

```bash
./commands.sh logs        # View live logs
./commands.sh status      # Check container status
./commands.sh restart     # Restart container
./commands.sh monitor     # Monitor resource usage
./commands.sh shell       # Access container shell
```

## Local Development

For local development and testing:

## API Endpoints

### Search Catalog
**POST** `/api/searchCatalog`

Search Amazon's catalog for products using keywords.

**Request Body:**
```json
{
  "keywords": ["t-shirt", "cotton"]
}
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "asin": "B08XYZ123",
      "title": "Cotton T-Shirt",
      "brand": "Example Brand",
      "bulletPoints": ["100% Cotton", "Machine Washable"],
      "thumbnailUrl": "https://...",
      "bsr": 1234
    }
  ]
}
```

### Health Check
**GET** `/health`

Returns service status and timestamp.

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Server port (default: 8080) | No |
| `SPAPI_REFRESH_TOKEN` | Amazon SP-API refresh token | Yes |
| `SPAPI_CLIENT_ID` | Amazon SP-API client ID | Yes |
| `SPAPI_APP_CLIENT_SECRET` | Amazon SP-API client secret | Yes |

## Architecture

- **Server**: Hetzner VPS (5.161.181.165)
- **Reverse Proxy**: Nginx Proxy Manager
- **Container Port**: 8081 (to avoid conflicts)
- **Domain**: merchbase.co/api/searchCatalog
- **Management**: CLI scripts for deployment and monitoring

## Server Infrastructure

The service integrates with your existing server setup:
- **Nginx Proxy Manager**: Routes traffic from merchbase.co to container
- **Portainer**: Container management (port 9000)
- **Watchtower**: Disabled for this service (manual updates)
- **Health Checks**: Built-in container health monitoring

## Development Scripts

- `yarn dev` - Start development server with hot reload
- `yarn build` - Build for production
- `yarn start` - Start production server
- `yarn type-check` - Run TypeScript type checking

## Docker Health Checks

The container includes built-in health checks that ping the `/health` endpoint every 30 seconds.