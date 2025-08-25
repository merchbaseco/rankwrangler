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

# Test searchCatalog endpoint
echo "🔍 Testing searchCatalog endpoint..."
echo ""

# Test 1: T-shirt search
echo "📦 Searching for: t-shirt"
curl -s -X POST "$API_BASE/api/searchCatalog" \
  -H "Content-Type: application/json" \
  -d '{"keywords": ["t-shirt"]}' | jq '.'

echo ""

# Test 2: Coffee mug search  
echo "📦 Searching for: coffee, mug"
curl -s -X POST "$API_BASE/api/searchCatalog" \
  -H "Content-Type: application/json" \
  -d '{"keywords": ["coffee", "mug"]}' | jq '.'

echo ""

# Test 3: Wireless headphones search
echo "📦 Searching for: wireless, headphones" 
curl -s -X POST "$API_BASE/api/searchCatalog" \
  -H "Content-Type: application/json" \
  -d '{"keywords": ["wireless", "headphones"]}' | jq '.'

echo ""
echo "✅ API testing complete!"