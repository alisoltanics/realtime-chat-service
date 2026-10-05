#!/bin/sh
set -e

echo "waiting for database..."
python - <<'PY'
import os
import time
import socket

host = os.environ.get("POSTGRES_HOST", "postgres")
port = int(os.environ.get("POSTGRES_PORT", "5432"))
deadline = time.time() + 60
while True:
    try:
        with socket.create_connection((host, port), timeout=2):
            print(f"database {host}:{port} is reachable")
            break
    except OSError:
        if time.time() > deadline:
            raise SystemExit("database did not become reachable in time")
        time.sleep(1)
PY

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "applying migrations..."
  python manage.py migrate --noinput
fi

if [ "${COLLECT_STATIC:-false}" = "true" ]; then
  python manage.py collectstatic --noinput
fi

if [ "${SEED_DEMO_DATA:-false}" = "true" ]; then
  echo "seeding demo data..."
  python manage.py seed_demo
fi

exec "$@"