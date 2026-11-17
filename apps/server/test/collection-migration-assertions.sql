-- The pre-upgrade fixture is known non-Merch with no Keepa fetch: it must survive admission.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM history_admission_rollouts
        WHERE key = 'history-admission-v1' AND baseline_products = 3) THEN
        RAISE EXCEPTION 'History baseline did not capture every pre-upgrade Product';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM products
        WHERE asin = 'B000000001' AND history_admission_state = 'admitted'
        AND history_admission_reason = 'legacy' AND history_admitted_at IS NOT NULL
        AND keepa_fetched_at IS NULL AND is_merch_listing = false) THEN
        RAISE EXCEPTION 'Never-fetched non-Merch Product lost baseline admission';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM products WHERE asin = 'B0UNKNOWN1' AND is_merch_listing = false) THEN
        RAISE EXCEPTION 'Unclassified Product was not backfilled as non-Merch';
    END IF;
    IF (SELECT count(*) FROM products WHERE history_admission_state = 'admitted'
        AND history_admission_reason = 'legacy') <> 3 THEN
        RAISE EXCEPTION 'Baseline did not include all Merch and unknown identities';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM keyword_products membership
        JOIN catalog_queries query ON query.id = membership.query_id
        WHERE query.normalized_term = 'migration fishing'
        AND membership.first_observed_at = '2026-10-21 12:00:00'
        AND membership.last_observed_at = '2026-10-22 12:00:00'
        AND query.tier = 'hot' AND query.next_due_at = '2026-10-23 12:00:00') THEN
        RAISE EXCEPTION 'Retained keyword observations or active research lease were lost';
    END IF;
    -- The scan due backfill reads the preserved budget pass: depth, due when its lease ends.
    IF NOT EXISTS (SELECT 1 FROM discovery_targets target
        JOIN keyword_exploration_passes pass ON pass.target_id = target.id
        WHERE pass.next_page_token = 'preserved-frontier' AND (NOT target.enabled
            OR (target.scan_depth AND target.scan_due_at
                = greatest(pass.resume_at, pass.claim_at + interval '5 minutes')))) THEN
        RAISE EXCEPTION 'Scan due backfill did not derive the preserved pass';
    END IF;
END $$;
BEGIN;
INSERT INTO products (marketplace_id, asin) VALUES ('ATVPDKIKX0DER', 'B0NEW00001');
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM products WHERE asin = 'B0NEW00001'
        AND history_admission_state = 'notAdmitted'
        AND history_admission_reason IS NULL AND history_admitted_at IS NULL) THEN
        RAISE EXCEPTION 'New Product inherited baseline admission';
    END IF;
END $$;
ROLLBACK;
