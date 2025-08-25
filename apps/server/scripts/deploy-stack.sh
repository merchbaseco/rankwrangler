#!/bin/bash
# Deploy RankWrangler Stack (nginx + postgres + server) using Docker Compose

set -e  # Exit on any error

SERVER="zknicker@5.161.181.165"
SSH_KEY="$HOME/Library/Mobile Documents/com~apple~CloudDocs/Business/MerchBase/SSH/hetzner"
REMOTE_DIR="~/rankwrangler-stack"  # Use home directory to avoid permission issues

# Check for --fresh flag
FRESH_DEPLOY=false
if [[ "$1" == "--fresh" ]]; then
    FRESH_DEPLOY=true
    echo "⚠️  WARNING: Fresh deployment will DELETE all database data!"
    echo "⚠️  This cannot be undone!"
    echo ""
    read -p "Are you absolutely sure you want to wipe the database? Type 'yes' to confirm: " confirm
    if [[ "$confirm" != "yes" ]]; then
        echo "❌ Deployment cancelled for safety"
        exit 1
    fi
    echo "🧹 Proceeding with fresh deployment..."
fi

echo "🚀 Deploying RankWrangler Stack..."
echo "📋 Stack components: nginx + postgres + server"
echo "📋 Deployment mode: $([ "$FRESH_DEPLOY" = true ] && echo "FRESH (data will be wiped)" || echo "SAFE (data preserved)")"
echo ""

echo "📋 Copying yarn files from turborepo root..."
# Copy yarn files from root for Docker build
cp ../../yarn.lock ./yarn.lock
cp ../../.yarnrc.yml ./.yarnrc.yml

echo "🚀 Building Docker image for AMD64 platform..."
docker build --progress=plain --platform linux/amd64 -t rankwrangler-server:latest .

echo "🧹 Cleaning up copied yarn files..."
rm yarn.lock .yarnrc.yml

echo "📦 Saving Docker image to local file..."
docker save rankwrangler-server:latest | gzip > /tmp/rankwrangler-server-stack.tar.gz

echo "📊 Image size: $(du -h /tmp/rankwrangler-server-stack.tar.gz | cut -f1)"

echo "🔐 Generating MD5 checksum..."
LOCAL_MD5=$(md5 -q /tmp/rankwrangler-server-stack.tar.gz)
echo "📋 Local MD5: $LOCAL_MD5"

echo "🚀 Transferring image to server..."
rsync -e "ssh -i \"$SSH_KEY\" -o ServerAliveInterval=60" --progress -v /tmp/rankwrangler-server-stack.tar.gz "$SERVER:/tmp/"

echo "🔍 Verifying transfer integrity..."
REMOTE_MD5=$(ssh -i "$SSH_KEY" "$SERVER" "md5sum /tmp/rankwrangler-server-stack.tar.gz | cut -d' ' -f1")
echo "📋 Remote MD5: $REMOTE_MD5"

if [ "$LOCAL_MD5" != "$REMOTE_MD5" ]; then
    echo "❌ MD5 checksums don't match! Transfer failed."
    echo "   Local:  $LOCAL_MD5"
    echo "   Remote: $REMOTE_MD5"
    exit 1
fi

echo "✅ Transfer verified successfully!"

echo "📥 Loading image on server..."
ssh -i "$SSH_KEY" "$SERVER" "echo 'Decompressing and loading Docker image...' && gunzip < /tmp/rankwrangler-server-stack.tar.gz | docker load && echo 'Image loaded successfully' && rm /tmp/rankwrangler-server-stack.tar.gz"

echo "🧹 Cleaning up local files..."
rm /tmp/rankwrangler-server-stack.tar.gz

echo "📁 Setting up stack directory..."
ssh -i "$SSH_KEY" "$SERVER" "mkdir -p $REMOTE_DIR"

echo "📁 Copying stack configuration files..."
rsync -e "ssh -i \"$SSH_KEY\"" docker-compose.stack.yml "$SERVER:$REMOTE_DIR/docker-compose.yml"
rsync -e "ssh -i \"$SSH_KEY\"" Caddyfile "$SERVER:$REMOTE_DIR/Caddyfile"
rsync -e "ssh -i \"$SSH_KEY\"" init.sql "$SERVER:$REMOTE_DIR/init.sql"

# Copy environment file
if [ -f ".env.production" ]; then
    echo "📁 Copying production environment..."
    rsync -e "ssh -i \"$SSH_KEY\"" .env.production "$SERVER:$REMOTE_DIR/.env"
else
    echo "⚠️  .env.production not found. Using .env.example as template..."
    rsync -e "ssh -i \"$SSH_KEY\"" .env.example "$SERVER:$REMOTE_DIR/.env"
    echo "⚠️  Please edit .env on the server with your actual credentials!"
fi

echo ""
echo "🔄 Deploying complete stack on server..."
ssh -i "$SSH_KEY" "$SERVER" << EOF
    # Stop any existing old deployment to avoid conflicts
    echo "⏹️  Stopping old standalone server..."
    cd /opt/rankwrangler-server && docker compose down 2>/dev/null || echo "No old deployment running"
    
    # Ensure webserver network exists
    echo "🌐 Ensuring webserver network exists..."
    docker network create webserver 2>/dev/null || echo "Network already exists"
    
    cd ~/rankwrangler-stack
    
    # Backup database if it exists (unless fresh deploy)
    if [ "$FRESH_DEPLOY" != "true" ] && docker ps -a --format '{{.Names}}' | grep -q "rankwrangler-postgres"; then
        echo "💾 Creating database backup..."
        BACKUP_NAME="backup-\$(date +%Y%m%d-%H%M%S).sql"
        docker exec rankwrangler-postgres pg_dump -U rankwrangler rankwrangler > "\$BACKUP_NAME" 2>/dev/null || echo "⚠️  Could not create backup (database may be empty)"
    fi
    
    echo "⏹️  Stopping existing stack..."
    if [ "$FRESH_DEPLOY" = "true" ]; then
        echo "🧹 Fresh deployment: removing all volumes and data..."
        docker compose down -v --remove-orphans || true
        docker volume rm rankwrangler-stack_postgres_data 2>/dev/null || echo "Volume already removed"
    else
        echo "💾 Safe deployment: preserving database volumes..."
        docker compose down --remove-orphans || true
    fi
    
    echo "🚀 Starting complete stack..."
    docker compose up -d --build
    
    echo "⏱️  Waiting for services to start..."
    sleep 30  # Give services time to start (server needs time for migrations)
    
    echo ""
    echo "📊 Checking service status..."
    
    # Check all containers
    echo "Container Status:"
    docker ps -a --filter name=rankwrangler --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    
    echo ""
    echo "🔍 Health Checks:"
    
    # Check PostgreSQL
    if docker exec rankwrangler-postgres pg_isready -U rankwrangler -d rankwrangler >/dev/null 2>&1; then
        echo "✅ PostgreSQL: Ready"
    else
        echo "❌ PostgreSQL: Not ready"
        echo "📋 PostgreSQL logs:"
        docker logs --tail 10 rankwrangler-postgres
    fi
    
    # Check Server
    sleep 5  # Allow migrations to complete
    if docker exec rankwrangler-server node -e "http.get('http://localhost:8080/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })" >/dev/null 2>&1; then
        echo "✅ Server: Ready"
    else
        echo "❌ Server: Not ready"
        echo "📋 Server logs:"
        docker logs --tail 10 rankwrangler-server
    fi
    
    # Check Caddy
    if docker exec rankwrangler-caddy wget -q --spider http://localhost/api/health >/dev/null 2>&1; then
        echo "✅ Caddy: Ready"
    else
        echo "❌ Caddy: Not ready"
        echo "📋 Caddy logs:"
        docker logs --tail 10 rankwrangler-caddy
    fi
    
    echo ""
    echo "📊 Stack Summary:"
    echo "  • PostgreSQL: localhost:5432 (internal)"
    echo "  • Server: localhost:8080 (internal)"
    echo "  • Caddy: localhost:8090 (external)"
    echo "  • Data Volume: postgres_data"
    echo ""
    
    # Final connectivity test
    if curl -sf http://localhost:8090/api/health >/dev/null 2>&1; then
        echo "✅ End-to-end test: SUCCESS"
        echo "🌐 Stack is ready to receive traffic on port 8090"
    else
        echo "❌ End-to-end test: FAILED"
        echo "🔧 Check individual services above"
    fi
EOF

echo ""
echo "✅ Stack Deployment Complete!"
echo ""
if [ "$FRESH_DEPLOY" = true ]; then
    echo "🧹 Fresh deployment completed - database was reset"
else
    echo "💾 Safe deployment completed - database data preserved"
    echo "📦 Database backup created (if existing data was found)"
fi
echo ""
echo "🌐 Server-level proxy is already configured with Caddy at:"
echo "  https://merchbase.co/api/* → Stack (port 8090)"
echo "  https://portainer.merchbase.co → Portainer"
echo ""
echo "📋 Useful commands:"
echo "  ssh -i \"$SSH_KEY\" $SERVER 'cd $REMOTE_DIR && docker compose logs -f'        # View logs"
echo "  ssh -i \"$SSH_KEY\" $SERVER 'cd $REMOTE_DIR && docker compose ps'             # Check status"
echo "  ssh -i \"$SSH_KEY\" $SERVER 'cd $REMOTE_DIR && docker compose restart'        # Restart stack"
echo "  ssh -i \"$SSH_KEY\" $SERVER 'cd $REMOTE_DIR && docker compose down'           # Stop stack"
echo ""
echo "🚀 Deployment options:"
echo "  yarn deploy:server-stack           # Safe deployment (preserves database)"
echo "  yarn deploy:server-stack --fresh   # Fresh deployment (wipes database)"
echo "  yarn deploy:server                 # Server-only update (fastest)"
echo ""
echo "🎯 Test endpoints:"
echo "  http://5.161.181.165:8090/api/health              # Direct to stack"
echo "  https://merchbase.co/api/health                   # Through main Caddy proxy"