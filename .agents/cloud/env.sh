# RankWrangler cloud agent session exports, sourced by the fleet start and
# every session shell.
# The real-database tests call initdb and pg_ctl directly, and Debian keeps
# them off PATH under /usr/lib/postgresql/<major>/bin.
for pg_initdb in /usr/lib/postgresql/*/bin/initdb; do
  if [ -x "$pg_initdb" ]; then
    export PATH="${pg_initdb%/initdb}:$PATH"
  fi
done
unset pg_initdb
