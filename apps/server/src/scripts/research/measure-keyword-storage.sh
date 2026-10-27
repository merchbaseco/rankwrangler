#!/usr/bin/env bash
# Disposable local storage experiment using the actual mining migration's table/index definitions.
set -euo pipefail
export LC_ALL=C
repo_dir="$(git rev-parse --show-toplevel)"
study_dir="${1:?pass the ignored study artifact directory}"
cluster_dir="$(mktemp -d /tmp/rw-storage-study.XXXXXX)"
study_port="$(dev-port --group | awk 'NR == 4 {print; exit}')"
postgres_bin="$(dirname "$(realpath "$(command -v postgres)")")"
started=false
cleanup() {
    if [[ "$started" == true ]]; then
        "$postgres_bin/pg_ctl" -D "$cluster_dir/data" -m fast -w stop >/dev/null
    fi
    trash "$cluster_dir"
}
trap cleanup EXIT
"$postgres_bin/initdb" --auth=trust --encoding=UTF8 --no-locale --username=research \
    --set=shared_memory_type=mmap --set=dynamic_shared_memory_type=mmap -D "$cluster_dir/data" >/dev/null
"$postgres_bin/pg_ctl" -D "$cluster_dir/data" -l "$cluster_dir/server.log" \
    -o "-h 127.0.0.1 -k $cluster_dir -p $study_port" -w start >/dev/null
started=true
python3 - "$repo_dir" "$study_dir" "$cluster_dir/work.sql" <<'PY'
import json, pathlib, sys
repo, study, output = map(pathlib.Path, sys.argv[1:])
migration = (repo/'apps/server/drizzle/0044_once_per_asin_keyword_mining.sql').read_text()
statements = [part.strip() for part in migration.split('--> statement-breakpoint')]
ddl = [part for part in statements if part.startswith('CREATE TABLE "mined_keyword_candidates"')
       or part.startswith('CREATE TABLE "product_keyword_candidates"')
       or part.startswith('CREATE TABLE "product_keyword_mining"')
       or part.startswith('CREATE UNIQUE INDEX "mined_keyword_candidates_identity_idx"')
       or part.startswith('ALTER TABLE "product_keyword_candidates" ADD CONSTRAINT')
       or part.startswith('ALTER TABLE "product_keyword_mining" ADD CONSTRAINT')]
terms = [row['term'] for row in json.loads((study/'provider-judgment-input.json').read_text())['cases']]
phrase_json = json.dumps(terms).replace("'", "''")
sql = 'CREATE TABLE products(id uuid PRIMARY KEY);\n' + '\n'.join(ddl)
sql += f"\nCREATE TEMP TABLE sample_terms AS SELECT value term, ordinality i FROM jsonb_array_elements_text('{phrase_json}'::jsonb) WITH ORDINALITY;\n"
sql += """
INSERT INTO products SELECT md5('product-'||i)::uuid FROM generate_series(1,10000) i;
INSERT INTO mined_keyword_candidates(id,marketplace_id,term,verdict,probability,judge_version,judged_at)
 SELECT md5('candidate-'||g.i)::uuid,'ATVPDKIKX0DER',t.term||' '||g.i,'accepted',.9,
 'jev-1.13.0:merch-buyer-search-v1',now() FROM generate_series(1,100000) g(i)
 JOIN sample_terms t ON t.i=1+(g.i-1)%(SELECT count(*) FROM sample_terms);
INSERT INTO product_keyword_candidates SELECT md5('product-'||p.i)::uuid,
 md5('candidate-'||(1+((p.i*97+k.i)%100000)))::uuid
 FROM generate_series(1,10000) p(i) CROSS JOIN generate_series(1,100) k(i);
INSERT INTO product_keyword_mining(product_id,stage,recommendations,recommended_at,completed_at)
 SELECT p.id,'complete',a.terms,now(),now() FROM products p CROSS JOIN
 (SELECT jsonb_agg(term) terms FROM (SELECT term FROM sample_terms ORDER BY i LIMIT 100) t) a;
VACUUM ANALYZE;
SELECT json_agg(row_to_json(s)) FROM (
 SELECT relname,pg_total_relation_size(c.oid) bytes,c.reltuples::bigint rows,
 pg_total_relation_size(c.oid)/greatest(c.reltuples,1) bytes_per_row
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND relname IN
 ('mined_keyword_candidates','product_keyword_candidates','product_keyword_mining')) s;
"""
output.write_text(sql)
PY
"$postgres_bin/psql" -X -qAt -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$study_port" \
    -U research -d postgres -f "$cluster_dir/work.sql"
