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

# License-authenticated public API
if [ -n "$RR_LICENSE_KEY" ]; then
    echo "🔑 Testing License-authenticated public API..."
    echo ""
    echo "✅ Testing api.public.license.validate..."
    curl -s -X POST "$API_BASE/api/api.public.license.validate" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $RR_LICENSE_KEY" \
      -d '{"input":null}' | jq '.'
    echo ""
    echo "✅ Testing api.public.license.status..."
    curl -s -X POST "$API_BASE/api/api.public.license.status" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $RR_LICENSE_KEY" \
      -d '{"input":null}' | jq '.'
    echo ""
    echo "📦 Testing api.public.getProductInfo..."
    curl -s -X POST "$API_BASE/api/api.public.getProductInfo" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $RR_LICENSE_KEY" \
      -d '{"input": {"marketplaceId": "ATVPDKIKX0DER", "asin": "B0DV53VS61"}}' | jq '.'
    echo ""
else
    echo "⚠️ Skipping public API tests - set RR_LICENSE_KEY to exercise public endpoints."
    echo ""
fi

# Clerk-authenticated app API
if [ -n "$RR_CLERK_TOKEN" ]; then
    echo "🔐 Testing Clerk-authenticated app API..."
    echo ""
    echo "📦 Testing api.app.getProductInfo..."
    curl -s -X POST "$API_BASE/api/api.app.getProductInfo" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $RR_CLERK_TOKEN" \
      -d '{"input": {"marketplaceId": "ATVPDKIKX0DER", "asin": "B0DV53VS61"}}' | jq '.'
    echo ""
else
    echo "⚠️ Skipping app API tests - set RR_CLERK_TOKEN to exercise Clerk endpoints."
    echo ""
fi

echo "✅ API testing complete!"
