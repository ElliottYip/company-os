#!/bin/sh
set -eu

target=/etc/company-os/feishu-secrets
source_secret=/etc/company-os/secrets/feishu-app-secret
umask 077

test -f "$source_secret"
if [ -e "$target" ]; then
  test -d "$target"
else
  install -d -m 0700 -o root -g root "$target"
fi
test -z "$(find "$target" -mindepth 1 -maxdepth 1 -print -quit)"

postgres_password=$(openssl rand -base64 36 | tr '+/' '-_' | tr -d '=\n')
runtime_password=$(openssl rand -base64 36 | tr '+/' '-_' | tr -d '=\n')
session_key=$(openssl rand -hex 48)

printf '%s\n' "$postgres_password" > "$target/postgres-password"
printf '%s\n' "$runtime_password" > "$target/runtime-database-password"
printf 'postgresql://company_os_owner:%s@postgres:5432/company_os?sslmode=disable\n' \
  "$postgres_password" > "$target/migration-database-url"
printf 'postgresql://company_os_runtime:%s@postgres:5432/company_os?sslmode=disable\n' \
  "$runtime_password" > "$target/runtime-database-url"
printf '%s\n' "$session_key" > "$target/session-signing-key"
install -m 0400 -o root -g root "$source_secret" "$target/feishu-app-secret"
chmod 0400 "$target"/*
chown root:root "$target" "$target"/*

unset postgres_password runtime_password session_key
printf '%s\n' '{"schemaVersion":1,"status":"PASS","secretValuesIncluded":false}'
