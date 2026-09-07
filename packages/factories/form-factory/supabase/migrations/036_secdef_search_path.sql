-- Pin search_path on every SECURITY DEFINER function in `public`.
--
-- A SECURITY DEFINER function with no search_path setting resolves unqualified
-- names against the *caller's* search_path. Any role that can create a schema
-- ahead of `public` -- or that PostgREST lets set a per-request search_path --
-- can therefore shadow a table these functions read, and the function will
-- happily read the attacker's table with the definer's privileges. Every one of
-- these functions is on a tenant-authorization or anonymous-capability path, so
-- that is a real escalation surface even though nothing here is known to be
-- exploitable today.
--
-- This migration changes resolution only. It uses ALTER FUNCTION so no body is
-- rewritten: signatures, bodies, grants, ownership and authorization logic are
-- all untouched, which keeps the diff auditable and rules out semantic drift.
--
-- Why `pg_catalog, public` and nothing else:
--   * pg_catalog is named explicitly rather than relied on implicitly, so the
--     setting reads as a complete list instead of a partial one.
--   * public holds every application table these functions touch.
--   * No third schema is needed: the only cross-schema references in any of
--     these bodies -- auth.uid(), auth.users, storage.objects -- are already
--     schema-qualified, and gen_random_uuid()/hashtext() are pg_catalog
--     builtins on PG13+, not the `extensions` copy.
-- Because of that, schema-qualifying the remaining bare table names would add
-- no security once search_path is pinned, so the bodies are deliberately left
-- alone.
--
-- Five functions already carried `SET search_path TO 'public'`. That was
-- already safe (pg_catalog is searched first implicitly), but they are
-- normalised here so the whole set is explicit and uniform.
--
-- NOTE for future migrations: CREATE OR REPLACE FUNCTION drops proconfig.
-- Any later redefinition of these functions must restate its own
-- `SET search_path`.

DO $$
DECLARE
  fn RECORD;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = pg_catalog, public', fn.sig);
  END LOOP;
END;
$$;

-- Fail the migration if any SECURITY DEFINER function in public was missed.
DO $$
DECLARE
  v_missing TEXT;
BEGIN
  SELECT string_agg(p.oid::regprocedure::text, ', ')
  INTO v_missing
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prosecdef
    AND NOT ('search_path=pg_catalog, public' = ANY (coalesce(p.proconfig, ARRAY[]::text[])));

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'SECURITY DEFINER functions still lack a pinned search_path: %', v_missing;
  END IF;
END;
$$;
