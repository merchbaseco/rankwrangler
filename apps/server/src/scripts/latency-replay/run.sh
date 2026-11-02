#!/usr/bin/env bash
# Boots a local development server with job workers and the Keepa stand-in preloaded, replays
# Factory's recorded RankWrangler bursts against it, then stops it. Never targets production.
#
#   apps/server/src/scripts/latency-replay/run.sh --client factory --lanes 4 --out /tmp/before.json
#
# RW_REPLAY_DATASET    calls.jsonl (default ~/.factory/handoff/rankwrangler-latency/calls.jsonl)
# RW_REPLAY_PORT       server port (default: dev-port, else 37172)
# RW_REPLAY_DB_PORT    loopback PostgreSQL port of a seeded database (default 5433)
# RW_REPLAY_KEEPA_SEARCH_MS  Keepa search latency the stand-in answers after (default 14000, calibrated so a lone live keyword results call matches production's 16s)
set -euo pipefail

server_dir="$(cd "$(dirname "$0")/../../.." && pwd)"
dataset="${RW_REPLAY_DATASET:-$HOME/.factory/handoff/rankwrangler-latency/calls.jsonl}"
port="${RW_REPLAY_PORT:-$(dev-port 2>/dev/null || echo 37172)}"
db_port="${RW_REPLAY_DB_PORT:-5433}"
log="${TMPDIR:-/tmp}/latency-replay-server-$port.log"

asins="$(psql -h 127.0.0.1 -p "$db_port" -U postgres -d rankwrangler -At -c "
    select string_agg(asin, ',') from (
        select asin from products
        where marketplace_id = 'ATVPDKIKX0DER' and amazon_listing_status <> 'deleted'
            and sp_api_fetched_at > timezone('UTC', now()) - interval '36 hours'
        order by asin limit 40) fresh")"
if [[ -z "$asins" ]]; then
    echo "No fresh local Products; run 'bun run db:seed:dev' first." >&2
    exit 1
fi

# Backfilled scenario: evidence a previous run stored under this term prefix is aged past the 24h
# reuse window, as a backfill would leave it, before the replay asks for those terms again.
if [[ -n "${RW_REPLAY_AGE_TERM_PREFIX:-}" ]]; then
    psql -h 127.0.0.1 -p "$db_port" -U postgres -d rankwrangler -q -v ON_ERROR_STOP=1 \
        -v prefix="$RW_REPLAY_AGE_TERM_PREFIX %" -v hours="${RW_REPLAY_AGE_HOURS:-72}" <<'SQL'
with aged as (select id from catalog_queries where display_term like :'prefix')
update catalog_search_runs set
    source_started_at = timezone('UTC', now()) - make_interval(hours => :hours),
    source_completed_at = timezone('UTC', now()) - make_interval(hours => :hours),
    created_at = timezone('UTC', now()) - make_interval(hours => :hours)
where query_id in (select id from aged);
update catalog_queries set next_refresh_attempt_at = null,
    latest_successful_run_at = timezone('UTC', now()) - make_interval(hours => :hours)
where display_term like :'prefix';
delete from operations where type = 'catalogSearch' and status = 'pending'
    and target_key in (select id::text from catalog_queries where display_term like :'prefix');
SQL
fi

cd "$server_dir"
RW_REPLAY_ASINS="$asins" RANKWRANGLER_PORT="$port" RANKWRANGLER_DATABASE_PORT="$db_port" NODE_ENV=development \
    RANKWRANGLER_DISABLE_SERVER_JOB_RUNNER=false \
    bunx varlock run -p ../../.env.schema -- \
    node_modules/.bin/tsx --import ./src/scripts/latency-replay/upstream-stub.ts src/index.ts \
    >"$log" 2>&1 &
server_pid=$!
trap 'kill $server_pid 2>/dev/null; wait $server_pid 2>/dev/null || true' EXIT

for _ in $(seq 1 120); do
    curl -sf "http://127.0.0.1:$port/health/live" >/dev/null 2>&1 && break
    kill -0 "$server_pid" 2>/dev/null || { tail -40 "$log" >&2; exit 1; }
    sleep 1
done
echo "Server ready on $port (log: $log)"

node_modules/.bin/tsx src/scripts/latency-replay/replay.ts \
    --server "http://127.0.0.1:$port" --dataset "$dataset" --asins "$asins" "$@"
