DO $$
DECLARE
	legacy_license_count integer;
	approved_gate_count integer;
BEGIN
	IF to_regclass('public.licenses') IS NULL THEN
		RAISE EXCEPTION 'RankWrangler central-auth cutover requires the legacy licenses table';
	END IF;

	IF to_regclass('public.rankwrangler_cutover_gate') IS NULL THEN
		RAISE EXCEPTION 'RankWrangler central-auth cutover gate is missing';
	END IF;

	SELECT count(*)::integer
	INTO legacy_license_count
	FROM licenses;

	SELECT count(*)::integer
	INTO approved_gate_count
	FROM rankwrangler_cutover_gate
	WHERE state = 'approved';

	IF legacy_license_count <> approved_gate_count THEN
		RAISE EXCEPTION 'RankWrangler central-auth cutover requires one approved mapping per legacy license';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM rankwrangler_cutover_gate
		WHERE state <> 'approved'
	) THEN
		RAISE EXCEPTION 'RankWrangler central-auth cutover has an incomplete mapping gate';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM rankwrangler_cutover_gate gate
		WHERE gate.state = 'approved'
			AND (
				coalesce(gate.plan_digest, '') !~ '^[0-9a-f]{64}$'
				OR coalesce(gate.backup_fingerprint, '') !~ '^[0-9a-f]{64}$'
				OR coalesce(gate.preservation_proof, '') !~ '^[0-9a-f]{64}$'
				OR gate.approved_by IS NULL
				OR btrim(gate.approved_by) = ''
				OR gate.approved_at IS NULL
			)
	) THEN
		RAISE EXCEPTION 'RankWrangler central-auth cutover gate is not approved with complete proofs';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM licenses license
		LEFT JOIN rankwrangler_cutover_gate gate
			ON gate.legacy_license_id = license.id
			AND gate.state = 'approved'
		WHERE gate.id IS NULL
	) THEN
		RAISE EXCEPTION 'RankWrangler central-auth cutover is missing a legacy license mapping';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM rankwrangler_cutover_gate gate
		LEFT JOIN licenses license ON license.id = gate.legacy_license_id
		WHERE gate.state = 'approved' AND license.id IS NULL
	) THEN
		RAISE EXCEPTION 'RankWrangler central-auth cutover contains an unknown legacy license mapping';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM rankwrangler_cutover_gate gate
		LEFT JOIN rankwrangler_service_accounts account
			ON account.id = gate.service_account_id
			AND account.service = 'rankwrangler'
		WHERE gate.state = 'approved'
			AND (
				account.id IS NULL
				OR account.merchbase_user_id IS NULL
				OR btrim(account.merchbase_user_id) = ''
			)
	) THEN
		RAISE EXCEPTION 'RankWrangler central-auth cutover contains an unmapped service account';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM rankwrangler_cutover_gate gate
		JOIN licenses license ON license.id = gate.legacy_license_id
		JOIN rankwrangler_service_accounts account
			ON account.id = gate.service_account_id
			AND account.service = 'rankwrangler'
		WHERE gate.state = 'approved'
			AND (
				account.usage_today IS DISTINCT FROM license."usageToday"
				OR account.usage_count IS DISTINCT FROM license."usageCount"
				OR account.usage_limit IS DISTINCT FROM license."usageLimit"
				OR account.last_used_at IS DISTINCT FROM license."lastUsedAt"
				OR account.last_reset_at IS DISTINCT FROM license."lastResetAt"
			)
	) THEN
		RAISE EXCEPTION 'RankWrangler central-auth cutover did not preserve license metering';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM rankwrangler_cutover_gate gate
		JOIN rankwrangler_service_accounts account
			ON account.id = gate.service_account_id
			AND account.service = 'rankwrangler'
		WHERE gate.state = 'approved'
			AND NOT EXISTS (
				SELECT 1
				FROM access_projection projection
				WHERE projection.state = 'active'
					AND projection.access = 'granted'
					AND projection.merchbase_user_id = account.merchbase_user_id
			)
	) THEN
		RAISE EXCEPTION 'RankWrangler central-auth cutover mapping has no active granted Clerk projection';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM operations
		WHERE status = 'pending'
			AND (
				(
					type = 'productHistoryRefresh'
					AND nullif(btrim(input ->> 'ownerMerchbaseUserId'), '') IS NULL
				)
				OR (
					type = 'catalogSearch'
					AND coalesce(input ->> 'priority', 'interactive') = 'interactive'
					AND nullif(btrim(input ->> 'ownerMerchbaseUserId'), '') IS NULL
				)
			)
	) THEN
		RAISE EXCEPTION 'RankWrangler central-auth cutover requires every pending user operation to have an explicit owner';
	END IF;
END
$$;
--> statement-breakpoint
DROP TABLE "licenses";
--> statement-breakpoint
UPDATE "rankwrangler_cutover_gate"
SET "state" = 'consumed', "updated_at" = now()
WHERE "state" = 'approved';
