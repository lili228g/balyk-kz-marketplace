#!/bin/sh
set -eu

psql \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set=app_user="$APP_DB_USER" \
  --set=app_password="$APP_DB_PASSWORD" \
  --set=app_db="$POSTGRES_DB" <<'SQL'
CREATE ROLE :"app_user" LOGIN PASSWORD :'app_password';
GRANT CONNECT ON DATABASE :"app_db" TO :"app_user";
GRANT USAGE, CREATE ON SCHEMA public TO :"app_user";
SQL
