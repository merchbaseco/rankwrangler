#!/bin/bash

# Test script for RankWrangler Server API
# Run with: ./test-api.sh

API_BASE="http://localhost:8080"

echo "🚀 Testing RankWrangler Server API"
echo ""

# Test health check
echo "🔍 Testing health check..."
health_response=$(curl -s "$API_BASE/health")
if [ $? -eq 0 ]; then
    echo "✅ Health check: $health_response"
else
    echo "❌ Health check failed - is the server running?"
    echo "   Start server with: yarn start"
    exit 1
fi

echo ""

# License-gated endpoints
if [ -n "$RR_LICENSE_KEY" ]; then
    echo "🔐 Testing private Amazon API endpoints..."
    echo ""
    echo "📦 Testing api/amazon/getProductInfo (bulk)..."
    curl -s -X POST "$API_BASE/api/amazon/getProductInfo" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $RR_LICENSE_KEY" \
      -d '{"marketplaceId": "ATVPDKIKX0DER", "asins": ["B0DV53VS61", "B0B9PWCVSC"]}' | jq '.'
    echo ""
    echo "📦 Testing api/amazon/getProductInfo (single)..."
    curl -s -X POST "$API_BASE/api/amazon/getProductInfo" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $RR_LICENSE_KEY" \
      -d '{"marketplaceId": "ATVPDKIKX0DER", "asins": ["B0DV53VS61"]}' | jq '.'
    echo ""
else
    echo "⚠️ Skipping private API tests - set RR_LICENSE_KEY to exercise license-gated endpoints."
    echo ""
fi

echo "✅ API testing complete!"
