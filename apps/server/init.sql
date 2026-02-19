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
-- Key tables: licenses, products, product_ingest_queue, keepa_history_refresh_queue, product_history_imports, product_history_points, keepa_categories, job_executions, job_execution_logs

-- Log successful initialization
\echo 'PostgreSQL initialization completed successfully'
\echo 'Database: rankwrangler'
\echo 'User: rankwrangler'
\echo 'Extensions: uuid-ossp'
\echo 'Ready for Drizzle migrations...'
