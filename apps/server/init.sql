-- PostgreSQL initialization script for RankWrangler Stack
-- This script only handles database/user setup - Drizzle migrations handle schema

-- Ensure the database exists (should already be created by POSTGRES_DB)
-- This is redundant but safe
SELECT 'CREATE DATABASE rankwrangler' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'rankwrangler')\gexec

-- Connect to the rankwrangler database
\c rankwrangler

-- Ensure the user exists with proper password (should already be created by POSTGRES_USER)
-- This is redundant but safe
DO
$do$
BEGIN
   IF NOT EXISTS (
      SELECT FROM pg_catalog.pg_roles
      WHERE rolname = 'rankwrangler') THEN

      CREATE USER rankwrangler WITH PASSWORD 'SecurePass123';
   END IF;
END
$do$;

-- Grant all privileges on the database
GRANT ALL PRIVILEGES ON DATABASE rankwrangler TO rankwrangler;

-- Grant all privileges on the public schema
GRANT ALL ON SCHEMA public TO rankwrangler;

-- Grant privileges on all tables in public schema (current and future)
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO rankwrangler;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO rankwrangler;

-- Grant privileges on all sequences in public schema (current and future)
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO rankwrangler;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO rankwrangler;

-- Grant privileges on all functions in public schema (current and future)
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO rankwrangler;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO rankwrangler;

-- Enable the uuid-ossp extension for UUID generation (required by Drizzle schema)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Note: Table schemas are created by Drizzle migrations (see drizzle/ directory)
-- Key tables: access_projection, rankwrangler_service_accounts, products
-- (includes source-aware SP-API/Keepa freshness, Keepa metrics, and nullable
-- products.is_merch_listing; NULL means classification knowledge is unavailable, and
-- products.amazon_listing_status records whether the Amazon listing is active or deleted),
-- product_short_names, product_cutout_thumbnails, product_facet_values, product_facets,
-- product_ingest_queue, keepa_history_refresh_queue, product_history_imports,
-- product_history_series (compact Keepa series), product_history_points (legacy, until dropped),
-- keepa_categories,
--
-- operations, event_logs, job_executions, job_execution_logs, provider_attempts
-- catalog_queries (keyword admission, tiers, demand, due dates and research leases),
-- keyword_products, keyword_exploration_passes (scoped discovery target and fenced claim),
-- keyword_discovery_attempts (physical starts and page yield), discovery_targets,
-- keyword_standing_observations (score history per standing observation), discovery_evidence,
-- discovery_source_scans, brand_discovery_products, spapi_catalog_capacity,
-- keepa_capacity_state, keepa_capacity_attempts, history_admission_rollouts,
-- catalog_search_runs (page and trigger provenance),
-- catalog_search_results, official_brands (verified marketplace-specific brand exclusions)

-- Log successful initialization
\echo 'PostgreSQL initialization completed successfully'
\echo 'Database: rankwrangler'
\echo 'User: rankwrangler'
\echo 'Extensions: uuid-ossp'
\echo 'Ready for Drizzle migrations...'

-- automatic_sync_control, keyword_autocomplete and keyword_mining_capacity persist the pause
-- switch, one-time autocomplete expansion and autocomplete pacing.
-- brand_analytics_search_terms keeps the latest kept weekly Brand Analytics search terms (rank,
-- apparel clicks, Merch product text, prefix, clicked ASINs, first/last week, trial registration);
-- brand_analytics_imports records each weekly report import's state and counts; keyword_prefixes
-- holds one row per tracked-keyword prefix and its one-time autocomplete expansion.
