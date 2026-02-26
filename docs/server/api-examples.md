# API Examples (curl)

## Public: Product Info

```bash
curl -s -X POST http://localhost:8080/api/api.public.getProductInfo \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $RR_LICENSE_KEY" \
  -d '{"input":{"marketplaceId":"ATVPDKIKX0DER","asin":"B0DV53VS61"}}'
```

## Public: Product Info Batch

```bash
curl -s -X POST http://localhost:8080/api/api.public.getProductInfoBatch \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $RR_LICENSE_KEY" \
  -d '{"input":{"marketplaceId":"ATVPDKIKX0DER","asins":["B0DV53VS61","B0DV53VS62"]}}'
```

## Public: Product History (BSR)

```bash
curl -s -X POST http://localhost:8080/api/api.public.getProductHistory \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $RR_LICENSE_KEY" \
  -d '{"input":{"marketplaceId":"ATVPDKIKX0DER","asin":"B0DV53VS61","limit":1000,"days":365}}'
```

`api.public.getProductHistory` behavior:

- Returns Keepa `bsrMain` points from `product_history_points`.
- If no points exist yet, it may trigger high-priority manual Keepa sync and return:
  - `collecting: true`
  - `syncTriggered: true|false`

## App: Product Info

```bash
curl -s -X POST http://localhost:8080/api/api.app.getProductInfo \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $RR_CLERK_TOKEN" \
  -d '{"input":{"marketplaceId":"ATVPDKIKX0DER","asin":"B0DV53VS61"}}'
```

## App: Manual Keepa Import

```bash
curl -s -X POST http://localhost:8080/api/api.app.loadProductHistory \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $RR_CLERK_TOKEN" \
  -d '{"input":{"marketplaceId":"ATVPDKIKX0DER","asin":"B0DV53VS61","days":365}}'
```

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

For category-specific BSR:

```bash
curl -s -X POST http://localhost:8080/api/api.app.getProductHistory \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $RR_CLERK_TOKEN" \
  -d '{"input":{"marketplaceId":"ATVPDKIKX0DER","asin":"B0DV53VS61","metric":"bsrCategory","categoryId":7141123011,"limit":1000}}'
```
