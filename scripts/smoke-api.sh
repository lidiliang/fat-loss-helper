#!/bin/sh
set -eu

api_url="${1:-http://127.0.0.1:8080/api/v1}"
email="smoke-$(date +%s)@example.com"
password="TestPass123!"

register_response=$(curl -fsS -X POST "$api_url/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"冒烟测试\",\"email\":\"$email\",\"password\":\"$password\"}")
token=$(printf '%s' "$register_response" | jq -r '.token')
test -n "$token"

login_token=$(curl -fsS -X POST "$api_url/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$email\",\"password\":\"$password\"}" | jq -r '.token')
test -n "$login_token"

snapshot='{"version":1,"exportedAt":"2026-08-10T14:00:00Z","profile":null,"customFoods":[],"meals":[],"exercises":[],"weights":[],"templates":[],"reminders":null}'
curl -fsS -X POST "$api_url/sync" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $token" \
  -d "{\"snapshot\":$snapshot}" | jq -e '.backedUpAt' >/dev/null

curl -fsS "$api_url/sync/latest" \
  -H "Authorization: Bearer $login_token" | jq -e '.snapshot.version == 1' >/dev/null

printf '%s\n' 'API smoke test passed: register, login, backup, restore.'
