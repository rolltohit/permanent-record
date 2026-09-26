#!/usr/bin/env bash
# Runs supabase/tests/rls.sql against the local Supabase database.
set -euo pipefail
cd "$(dirname "$0")"
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
if command -v psql >/dev/null; then
  psql "$DB_URL" -q -v ON_ERROR_STOP=1 -f rls.sql
else
  container=$(docker ps --filter "name=supabase_db_" --format '{{.Names}}' | head -1)
  [ -n "$container" ] || { echo "Local Supabase isn't running (npx supabase start)." >&2; exit 1; }
  docker exec -i "$container" psql -U postgres -q -v ON_ERROR_STOP=1 < rls.sql
fi
