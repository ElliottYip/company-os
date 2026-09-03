#!/bin/sh
set -eu

target=${COMPANY_OS_SECRET_DIRECTORY:-/etc/company-os/feishu-secrets}
key_file="$target/tenant-secret-master-key"
umask 077

test -d "$target"
if [ -e "$key_file" ]; then
  test -f "$key_file"
  test "$(wc -c < "$key_file" | tr -d ' ')" -eq 44
  printf '%s\n' '{"schemaVersion":1,"status":"ALREADY_PRESENT","secretValuesIncluded":false}'
  exit 0
fi

temporary="$target/.tenant-secret-master-key.tmp.$$"
trap 'rm -f "$temporary"' EXIT HUP INT TERM
openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n' > "$temporary"
printf '\n' >> "$temporary"
test "$(wc -c < "$temporary" | tr -d ' ')" -eq 44
chmod 0400 "$temporary"
chown root:root "$temporary"
mv "$temporary" "$key_file"
trap - EXIT HUP INT TERM
printf '%s\n' '{"schemaVersion":1,"status":"CREATED","secretValuesIncluded":false}'
