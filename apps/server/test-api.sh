#!/bin/bash

# Test script for RankWrangler Server API
# Run with: ./test-api.sh

API_BASE="http://localhost:8080"

echo "🚀 Testing RankWrangler Server API"
echo ""

# Test health check
echo "🔍 Testing health check..."
health_response=$(curl -s "$API_BASE/api/health")
if [ $? -eq 0 ]; then
    echo "✅ Health check: $health_response"
else
    echo "❌ Health check failed - is the server running?"
    echo "   Start server with: bun run start"
    exit 1
fi

echo ""

# Clerk-authenticated endpoints
if [ -n "$RR_CLERK_TOKEN" ]; then
    echo "🔐 Testing Clerk-authenticated API endpoints..."
    echo ""
    echo "📦 Testing public.getProductInfo..."
    curl -s -X POST "$API_BASE/api/public.getProductInfo" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $RR_CLERK_TOKEN" \
      -d '{"input": {"marketplaceId": "ATVPDKIKX0DER", "asin": "B0DV53VS61"}}' | jq '.'
    echo ""
else
    echo "⚠️ Skipping Clerk API tests - set RR_CLERK_TOKEN to exercise authenticated endpoints."
    echo ""
fi

echo "✅ API testing complete!"
