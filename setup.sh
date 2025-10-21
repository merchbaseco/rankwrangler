#!/bin/bash
# One-time setup for RankWrangler Server on Hetzner

set -e  # Exit on any error

SERVER="zknicker@5.161.181.165"
SSH_KEY="$HOME/Library/Mobile Documents/com~apple~CloudDocs/Business/MerchBase/SSH/hetzner"
REMOTE_DIR="/opt/rankwrangler-server"

echo "🔧 Setting up RankWrangler Server on Hetzner..."

echo "📁 Creating remote directory..."
ssh -t -i "$SSH_KEY" "$SERVER" << EOF
    sudo mkdir -p $REMOTE_DIR
    sudo chown \$USER:\$USER $REMOTE_DIR
    echo "✅ Directory $REMOTE_DIR created with proper permissions"
EOF

echo "📋 Setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit .env.production with your actual SP-API credentials:"
echo "   - SPAPI_REFRESH_TOKEN"
echo "   - SPAPI_CLIENT_ID" 
echo "   - SPAPI_APP_CLIENT_SECRET"
echo ""
echo "2. Run deployment:"
echo "   ./deploy.sh"
echo ""
echo "3. Configure Nginx Proxy Manager:"
echo "   - Access: http://5.161.181.165:81"
echo "   - Add proxy host for merchbase.co"
echo "   - Route /api/searchCatalog to localhost:8081"
echo ""
echo "4. Test the endpoint:"
echo "   curl -X POST https://merchbase.co/api/searchCatalog \\"
echo "        -H 'Content-Type: application/json' \\"
echo "        -d '{\"keywords\": [\"test\"]}'"