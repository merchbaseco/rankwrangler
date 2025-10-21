#!/bin/bash
# Migrate from nginx-proxy-manager to Caddy
# This script handles the complete migration safely

set -e  # Exit on any error

SERVER="zknicker@5.161.181.165"
SSH_KEY="$HOME/Library/Mobile Documents/com~apple~CloudDocs/Business/MerchBase/SSH/hetzner"

echo "🚀 Starting Caddy Migration..."
echo ""

# Step 1: Deploy the new stack with Caddy
echo "📦 Deploying updated stack with Caddy..."
yarn deploy:server-stack

echo ""
echo "⏳ Waiting for stack to stabilize..."
sleep 10

# Step 2: Copy server-level Caddy configuration
echo "📁 Setting up server-level Caddy..."
ssh -i "$SSH_KEY" "$SERVER" "mkdir -p ~/caddy-proxy"
rsync -e "ssh -i \"$SSH_KEY\"" caddy-proxy/Caddyfile "$SERVER:~/caddy-proxy/Caddyfile"
rsync -e "ssh -i \"$SSH_KEY\"" caddy-proxy/docker-compose.yml "$SERVER:~/caddy-proxy/docker-compose.yml"

echo ""
echo "🔄 Performing migration on server..."
ssh -i "$SSH_KEY" "$SERVER" << 'EOF'
    echo "📊 Current status:"
    echo "Checking stack health..."
    curl -f http://localhost:8090/api/health || echo "Stack not ready yet"
    
    echo ""
    echo "⏹️  Stopping nginx-proxy-manager..."
    docker stop nginx-proxy-manager || echo "NPM already stopped"
    
    echo "🚀 Starting Caddy proxy..."
    cd ~/caddy-proxy
    docker compose up -d
    
    echo "⏱️  Waiting for Caddy to start..."
    sleep 10
    
    echo "🔍 Testing new setup..."
    # Test internal connection
    if curl -f http://localhost:8090/api/health >/dev/null 2>&1; then
        echo "✅ Stack connection: OK"
    else
        echo "❌ Stack connection: FAILED"
    fi
    
    # Test external connection (HTTP - will redirect to HTTPS)
    if curl -f -L http://localhost/api/health >/dev/null 2>&1; then
        echo "✅ External connection: OK"
    else
        echo "❌ External connection: FAILED"
    fi
    
    echo ""
    echo "📊 Final status:"
    echo "Active containers:"
    docker ps --format "table {{.Names}}\t{{.Status}}" | grep -E "(caddy|rankwrangler)"
EOF

echo ""
echo "✅ Migration Phase 1 Complete!"
echo ""
echo "🔍 Testing from external:"
echo "  Testing HTTP redirect..."
curl -s -o /dev/null -w "HTTP Status: %{http_code}\\n" http://5.161.181.165/api/health || echo "Connection test failed"

echo ""
echo "⚠️  Next Steps:"
echo "1. Wait 2-3 minutes for SSL certificates to generate"
echo "2. Test: https://merchbase.co/api/health"
echo "3. If working, run cleanup: ./scripts/cleanup-old-containers.sh"
echo ""
echo "🔧 If issues occur:"
echo "  Rollback: ssh and 'docker start nginx-proxy-manager'"
echo "  Debug: ssh and 'cd ~/caddy-proxy && docker compose logs -f'"