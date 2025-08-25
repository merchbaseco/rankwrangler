#!/bin/bash
# Deploy RankWrangler Server using SCP (alternative to rsync)

set -e  # Exit on any error

SERVER="zknicker@5.161.181.165"
SSH_KEY="$HOME/Library/Mobile Documents/com~apple~CloudDocs/Business/MerchBase/SSH/hetzner"
REMOTE_DIR="/opt/rankwrangler-server"

echo "📋 Copying yarn files from turborepo root..."
# Copy yarn files from root for Docker build
cp ../../yarn.lock ./yarn.lock
cp ../../.yarnrc.yml ./.yarnrc.yml

echo "🚀 Building Docker image for AMD64 platform..."
docker build --progress=plain --platform linux/amd64 -t rankwrangler-server:latest .

echo "🧹 Cleaning up copied yarn files..."
rm yarn.lock .yarnrc.yml

echo "📦 Saving Docker image to local file..."
docker save rankwrangler-server:latest | gzip > /tmp/rankwrangler-server.tar.gz

echo "📊 Image size: $(du -h /tmp/rankwrangler-server.tar.gz | cut -f1)"

echo "🔐 Generating MD5 checksum..."
LOCAL_MD5=$(md5 -q /tmp/rankwrangler-server.tar.gz)
echo "📋 Local MD5: $LOCAL_MD5"

echo "🚀 Transferring image to server using rsync..."
rsync -e "ssh -i \"$SSH_KEY\" -o ServerAliveInterval=60" --progress -v /tmp/rankwrangler-server.tar.gz "$SERVER:/tmp/"

echo "🔍 Verifying transfer integrity..."
REMOTE_MD5=$(ssh -i "$SSH_KEY" "$SERVER" "md5sum /tmp/rankwrangler-server.tar.gz | cut -d' ' -f1")
echo "📋 Remote MD5: $REMOTE_MD5"

if [ "$LOCAL_MD5" != "$REMOTE_MD5" ]; then
    echo "❌ MD5 checksums don't match! Transfer failed."
    echo "   Local:  $LOCAL_MD5"
    echo "   Remote: $REMOTE_MD5"
    exit 1
fi

echo "✅ Transfer verified successfully!"

echo "📥 Loading image on server..."
ssh -i "$SSH_KEY" "$SERVER" "echo 'Decompressing and loading Docker image...' && gunzip < /tmp/rankwrangler-server.tar.gz | docker load && echo 'Image loaded successfully' && rm /tmp/rankwrangler-server.tar.gz"

echo "🧹 Cleaning up local files..."
rm /tmp/rankwrangler-server.tar.gz

echo "📁 Copying configuration files..."
ssh -i "$SSH_KEY" "$SERVER" "mkdir -p $REMOTE_DIR"
rsync -e "ssh -i \"$SSH_KEY\"" docker-compose.prod.yml "$SERVER:$REMOTE_DIR/docker-compose.yml"

# Check if .env.production exists, if not copy from example
if [ -f ".env.production" ]; then
    rsync -e "ssh -i \"$SSH_KEY\"" .env.production "$SERVER:$REMOTE_DIR/.env"
else
    echo "⚠️  .env.production not found. Using .env.example as template..."
    rsync -e "ssh -i \"$SSH_KEY\"" .env.example "$SERVER:$REMOTE_DIR/.env"
    echo "⚠️  Please edit .env on the server with your actual credentials!"
fi

echo "🔄 Deploying on server..."
ssh -i "$SSH_KEY" "$SERVER" << EOF
    cd $REMOTE_DIR
    echo "⏹️  Stopping existing container..."
    docker compose down || true
    echo "▶️  Starting new container..."
    docker compose up -d
    echo "⏱️  Waiting for container to start..."
    sleep 5  # Give it a moment to start
    
    echo "📊 Checking container status..."
    CONTAINER_STATUS=\$(docker ps -a --filter name=rankwrangler-server --format "table {{.Status}}" | tail -n +2)
    
    if echo "\$CONTAINER_STATUS" | grep -q "Up"; then
        echo "✅ Container is running!"
        
        # Try health check
        if docker exec rankwrangler-server wget -q --spider http://localhost:8080/health 2>/dev/null; then
            echo "✅ Health check passed - service is ready!"
        else
            echo "⚠️  Container is running but health check failed"
            echo "📋 Container logs:"
            docker logs --tail 30 rankwrangler-server
        fi
    elif echo "\$CONTAINER_STATUS" | grep -q "Restarting"; then
        echo "❌ Container is crash looping"
        echo "📋 Error logs:"
        docker logs --tail 30 rankwrangler-server
        echo ""
        echo "🔧 To stop the container: ./commands.sh stop"
    else
        echo "❌ Container failed to start"
        echo "📋 Error logs:"
        docker logs --tail 30 rankwrangler-server || echo "No logs available"
    fi
EOF

echo ""
echo "✅ rsync Deployment complete!"
echo "🌐 Service should be available at: merchbase.co/api/searchCatalog"
echo "📋 Configure Nginx Proxy Manager to route /api/searchCatalog to localhost:8081"
echo ""
echo "Useful commands:"
echo "  ./commands.sh logs    - View container logs"
echo "  ./commands.sh status  - Check container status"
echo "  ./commands.sh restart - Restart container"