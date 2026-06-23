# API Examples (curl)

## Public: Product Get

```bash
curl -s -X POST http://localhost:8080/api/api.public.product.get \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $RR_LICENSE_KEY" \
  -d '{"input":{"marketplaceId":"ATVPDKIKX0DER","asin":"B0DV53VS61","metrics":["bsr","price"],"bucket":"auto","days":365}}'
```

`api.public.product.get` behavior:

- Returns `schemaVersion: 1`, `summary`, and bucketed agent `history`.
- Ensures product cache exists.
- If history is missing, runs manual history sync before returning.
- If summary succeeds but history fails, returns `status: "partial"` with `history.status: "error"`.

## Public: Product Summary

```bash
curl -s -X POST http://localhost:8080/api/api.public.product.getSummary \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $RR_LICENSE_KEY" \
  -d '{"input":{"marketplaceId":"ATVPDKIKX0DER","asin":"B0DV53VS61"}}'
```

`api.public.product.getSummary` returns the cheap product summary only. It does not import Keepa
history.

## Public: Product History (BSR)

```bash
curl -s -X POST http://localhost:8080/api/api.public.product.getHistory \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $RR_LICENSE_KEY" \
  -d '{"input":{"marketplaceId":"ATVPDKIKX0DER","asin":"B0DV53VS61","limit":1000,"days":365}}'
```

`api.public.product.getHistory` behavior:

- Default legacy format returns Keepa `bsrMain` points from `product_history_points`.
- Ensures product cache exists before querying history.
- If history has never been imported for the ASIN, runs manual history sync before returning.
- Date ranges before the first recorded point return an empty range after an import exists.
- `format: "agent"` returns schema v2 bucketed history instead of raw points.
  Use `bucket: "auto" | "day" | "week" | "month"`.
  Auto uses day buckets up to 45 days, week buckets up to 18 months, then month buckets.
- Public and app history routes share the same product-history service; auth wrapper and requested
  `format` choose the response shape.

## App: Amazon Product Search (ASIN)

```bash
curl -s -X POST http://localhost:8080/api/api.app.amazon.product.search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $RR_CLERK_TOKEN" \
  -d '{"input":{"marketplaceId":"ATVPDKIKX0DER","asin":"B0DV53VS61"}}'
```

## App: Amazon Keyword Search

```bash
curl -s -X POST http://localhost:8080/api/api.app.amazon.search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $RR_CLERK_TOKEN" \
  -d '{"input":{"keyword":"st patricks day shirt"}}'
```

`api.app.amazon.search` behavior:

- Returns keyword search results from Catalog Items API.
- Enqueues returned ASINs into the SP-API sync queue for background product sync.
- Treats missing `items` in the upstream Catalog Items response as a validation error.

## App: Search Terms List

```bash
curl -s -X POST http://localhost:8080/api/api.app.searchterms.list \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $RR_CLERK_TOKEN" \
  -d '{"input":{"marketplaceId":"ATVPDKIKX0DER","reportPeriod":"DAY","limit":25}}'
```

## App: Search Terms Status

```bash
curl -s -X POST http://localhost:8080/api/api.app.searchterms.status \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $RR_CLERK_TOKEN" \
  -d '{"input":{"marketplaceId":"ATVPDKIKX0DER","reportPeriod":"DAY"}}'
```

## App: Search Terms Refresh

```bash
curl -s -X POST http://localhost:8080/api/api.app.searchterms.refresh \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $RR_CLERK_TOKEN" \
  -d '{"input":{"marketplaceId":"ATVPDKIKX0DER","reportPeriod":"DAY"}}'
```

## App: Search Terms Trend

```bash
curl -s -X POST http://localhost:8080/api/api.app.searchterms.trend \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $RR_CLERK_TOKEN" \
  -d '{"input":{"marketplaceId":"ATVPDKIKX0DER","reportPeriod":"DAY","searchTerm":"st patricks day shirt","rangeDays":90}}'
```

## App: Manual Keepa Import

```bash
curl -s -X POST http://localhost:8080/api/api.app.loadProductHistory \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $RR_CLERK_TOKEN" \
  -d '{"input":{"marketplaceId":"ATVPDKIKX0DER","asin":"B0DV53VS61","days":365}}'
```

`api.app.loadProductHistory` ensures product cache exists before running Keepa history sync.

## App: Keepa Runtime Status

```bash
curl -s -X POST http://localhost:8080/api/api.app.getKeepaStatus \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $RR_CLERK_TOKEN" \
  -d '{"input":null}'
```

## Admin: Keepa Queue Log

```bash
curl -s -X POST http://localhost:8080/api/api.app.keepaLog \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $RR_CLERK_ADMIN_TOKEN" \
  -d '{"input":{"queueLimit":250,"processedLimit":20}}'
```

## App: Keepa History Query

```bash
curl -s -X POST http://localhost:8080/api/api.app.getProductHistory \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $RR_CLERK_TOKEN" \
  -d '{"input":{"marketplaceId":"ATVPDKIKX0DER","asin":"B0DV53VS61","metric":"bsrMain","limit":1000}}'
```

`api.app.getProductHistory` returns:

- `points[]` rows
- `latestImportAt`
- `categoryNames`
- `syncTriggered`

It uses the same product-history service as the public API with `format: "points"` and
`refresh: "if_missing"` by default.

For category-specific BSR:

```bash
curl -s -X POST http://localhost:8080/api/api.app.getProductHistory \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $RR_CLERK_TOKEN" \
  -d '{"input":{"marketplaceId":"ATVPDKIKX0DER","asin":"B0DV53VS61","metric":"bsrCategory","categoryId":7141123011,"limit":1000}}'
```
