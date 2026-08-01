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

# Optional dev Clerk sign-in token flow
if [ "$RR_TEST_DEV_CLERK" = "1" ]; then
    echo "🧪 Testing api.public.dev.createClerkSignInToken (dev only)..."
    dev_clerk_response=$(curl -s -X POST "$API_BASE/api/api.public.dev.createClerkSignInToken" \
      -H "Content-Type: application/json" \
      -d '{"input":null}')
    echo "$dev_clerk_response" | jq '.'

    dev_ticket=$(echo "$dev_clerk_response" | jq -r '.result.data.ticket // .result.data.json.ticket // empty')
    if [ -n "$dev_ticket" ]; then
        echo "✅ Dev Clerk ticket issued (${#dev_ticket} chars)"
    else
        echo "ℹ️ Dev Clerk ticket not issued (expected when feature is disabled or not localhost)."
    fi
    echo ""
fi

# Merchbase API-key authenticated public API
if [ -n "$MERCHBASE_API_KEY" ]; then
    echo "🔑 Testing Merchbase API-key authenticated public API..."
    echo ""
    echo "📦 Testing api.public.product.getSummary..."
    public_product_info_response=$(curl -s -X POST "$API_BASE/api/api.public.product.getSummary" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $MERCHBASE_API_KEY" \
      -d '{"input": {"marketplaceId": "ATVPDKIKX0DER", "asin": "B0DV53VS61"}}')
    echo "$public_product_info_response" | jq '.'
    echo "🧾 Merch fields (public):"
    echo "$public_product_info_response" | jq '.result.data.json | {isMerchListing, bullet1, bullet2}'
    echo ""
    echo "📦 Testing api.public.product.get (summary + history)..."
    curl -s -X POST "$API_BASE/api/api.public.product.get" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $MERCHBASE_API_KEY" \
      -d '{"input": {"marketplaceId": "ATVPDKIKX0DER", "asin": "B0DV53VS61", "metrics": ["bsr", "price"], "bucket": "week", "days": 365}}' | jq '.'
    echo ""
    echo "📈 Testing api.public.product.getHistory..."
    curl -s -X POST "$API_BASE/api/api.public.product.getHistory" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $MERCHBASE_API_KEY" \
      -d '{"input": {"marketplaceId": "ATVPDKIKX0DER", "asin": "B0DV53VS61", "limit": 100}}' | jq '.'
    echo ""
    echo "📉 Testing api.public.product.getHistory (agent format, bucketed bsr+price)..."
    curl -s -X POST "$API_BASE/api/api.public.product.getHistory" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $MERCHBASE_API_KEY" \
      -d '{"input": {"marketplaceId": "ATVPDKIKX0DER", "asin": "B0DV53VS61", "metrics": ["bsr", "price"], "format": "agent", "bucket": "week", "days": 365}}' | jq '.'
    echo ""
else
    echo "⚠️ Skipping public API tests - set MERCHBASE_API_KEY to exercise public endpoints."
    echo ""
fi

# Clerk-authenticated app API
if [ -n "$RR_CLERK_TOKEN" ]; then
    echo "🔐 Testing Clerk-authenticated app API..."
    echo ""
    echo "📦 Testing api.app.amazon.product.search..."
    app_product_info_response=$(curl -s -X POST "$API_BASE/api/api.app.amazon.product.search" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $RR_CLERK_TOKEN" \
      -d '{"input": {"marketplaceId": "ATVPDKIKX0DER", "asin": "B0DV53VS61"}}')
    echo "$app_product_info_response" | jq '.'
    echo "🧾 Merch fields (app):"
    echo "$app_product_info_response" | jq '.result.data.json | {isMerchListing, bullet1, bullet2}'
    echo ""
    echo "📈 Testing api.app.loadProductHistory..."
    curl -s -X POST "$API_BASE/api/api.app.loadProductHistory" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $RR_CLERK_TOKEN" \
      -d '{"input": {"marketplaceId": "ATVPDKIKX0DER", "asin": "B0DV53VS61", "days": 365}}' | jq '.'
    echo ""
    echo "📊 Testing api.app.getProductHistory..."
    curl -s -X POST "$API_BASE/api/api.app.getProductHistory" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $RR_CLERK_TOKEN" \
      -d '{"input": {"marketplaceId": "ATVPDKIKX0DER", "asin": "B0DV53VS61", "metric": "bsrMain", "limit": 100}}' | jq '.'
    echo ""
    echo "🏷️ Testing api.app.getProductHistory (bsrCategory names)..."
    curl -s -X POST "$API_BASE/api/api.app.getProductHistory" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $RR_CLERK_TOKEN" \
      -d '{"input": {"marketplaceId": "ATVPDKIKX0DER", "asin": "B0DV53VS61", "metric": "bsrCategory", "limit": 100}}' | jq '.'
    echo ""
    echo "🪙 Testing api.app.getKeepaStatus..."
    curl -s -X POST "$API_BASE/api/api.app.getKeepaStatus" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $RR_CLERK_TOKEN" \
      -d '{"input":null}' | jq '.'
    echo ""
    echo "🔎 Testing api.app.searchterms.list..."
    curl -s -X POST "$API_BASE/api/api.app.searchterms.list" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $RR_CLERK_TOKEN" \
      -d '{"input":{"marketplaceId":"ATVPDKIKX0DER","reportPeriod":"DAY","limit":25}}' | jq '.'
    echo ""
    echo "📡 Testing api.app.searchterms.status..."
    curl -s -X POST "$API_BASE/api/api.app.searchterms.status" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $RR_CLERK_TOKEN" \
      -d '{"input":{"marketplaceId":"ATVPDKIKX0DER","reportPeriod":"DAY"}}' | jq '.'
    echo ""
    echo "♻️ Testing api.app.searchterms.refresh..."
    curl -s -X POST "$API_BASE/api/api.app.searchterms.refresh" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $RR_CLERK_TOKEN" \
      -d '{"input":{"marketplaceId":"ATVPDKIKX0DER","reportPeriod":"DAY"}}' | jq '.'
    echo ""
    echo "📈 Testing api.app.searchterms.trend..."
    curl -s -X POST "$API_BASE/api/api.app.searchterms.trend" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $RR_CLERK_TOKEN" \
      -d '{"input":{"marketplaceId":"ATVPDKIKX0DER","reportPeriod":"DAY","searchTerm":"st patricks day shirt","rangeDays":90}}' | jq '.'
    echo ""
    echo "🛒 Testing api.app.amazon.search..."
    curl -s -X POST "$API_BASE/api/api.app.amazon.search" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $RR_CLERK_TOKEN" \
      -d '{"input":{"keyword":"st patricks day shirt"}}' | jq '.'
    echo ""
else
    echo "⚠️ Skipping app API tests - set RR_CLERK_TOKEN to exercise Clerk endpoints."
    echo ""
fi

# Clerk-authenticated admin API
if [ -n "$RR_CLERK_ADMIN_TOKEN" ]; then
    echo "🛡️ Testing Clerk-authenticated admin API..."
    echo ""
    echo "🪪 Testing api.app.adminStatus..."
    curl -s -X POST "$API_BASE/api/api.app.adminStatus" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $RR_CLERK_ADMIN_TOKEN" \
      -d '{"input":null}' | jq '.'
    echo ""
    echo "📊 Testing api.app.getAdminStats..."
    curl -s -X POST "$API_BASE/api/api.app.getAdminStats" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $RR_CLERK_ADMIN_TOKEN" \
      -d '{"input":null}' | jq '.'
    echo ""
    echo "🧮 Testing api.app.getAdminStats keepaMerchCoverage..."
    curl -s -X POST "$API_BASE/api/api.app.getAdminStats" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $RR_CLERK_ADMIN_TOKEN" \
      -d '{"input":null}' | jq '.result.data.json.keepaMerchCoverage'
    echo ""
    echo "🚨 Testing api.app.getAdminStats Job Failures stat..."
    curl -s -X POST "$API_BASE/api/api.app.getAdminStats" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $RR_CLERK_ADMIN_TOKEN" \
      -d '{"input":null}' | jq '.result.data.json.stats[] | select(.label == "Job Failures")'
    echo ""
    echo "🚨 Testing api.app.jobExecutions Keepa failures (fetch + enqueue)..."
    curl -s -X POST "$API_BASE/api/api.app.jobExecutions" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $RR_CLERK_ADMIN_TOKEN" \
      -d '{"input":{"limit":10,"status":"failed","jobNames":["fetch-keepa-history-for-asin","enqueue-scheduled-keepa-history-refresh"]}}' | jq '.'
    echo ""
    echo "🧵 Testing api.app.jobExecutions..."
    curl -s -X POST "$API_BASE/api/api.app.jobExecutions" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $RR_CLERK_ADMIN_TOKEN" \
      -d '{"input":{"limit":10}}' | jq '.'
    echo ""
    echo "🪵 Testing api.app.keepaLog..."
    curl -s -X POST "$API_BASE/api/api.app.keepaLog" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $RR_CLERK_ADMIN_TOKEN" \
      -d '{"input":{"queueLimit":50,"processedLimit":20}}' | jq '.'
    echo ""
    echo "🔎 Testing api.app.topSearchTermsStatus..."
    curl -s -X POST "$API_BASE/api/api.app.topSearchTermsStatus" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $RR_CLERK_ADMIN_TOKEN" \
      -d '{"input":null}' | jq '.'
    echo ""
else
    echo "⚠️ Skipping admin API tests - set RR_CLERK_ADMIN_TOKEN for admin-only procedures."
    echo ""
fi

echo "✅ API testing complete!"
