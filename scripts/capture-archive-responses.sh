#!/usr/bin/env bash
# capture-archive-responses.sh
#
# Interactive script to capture real comapeo-cloud API responses as test fixtures.
# Prompts for BASE_URL and BEARER_TOKEN, then saves each endpoint's response
# to tests/fixtures/ for use in unit tests and MSW mocks.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURES_DIR="$SCRIPT_DIR/../tests/fixtures"

mkdir -p "$FIXTURES_DIR"

# ---------------------------------------------------------------------------
# Prompt for credentials
# ---------------------------------------------------------------------------

read -rp "Base URL (e.g. https://archive.example.com): " BASE_URL
BASE_URL="${BASE_URL%/}" # strip trailing slash

read -rp "Bearer Token: " BEARER_TOKEN

if [[ -z "$BASE_URL" || -z "$BEARER_TOKEN" ]]; then
  echo "Error: BASE_URL and BEARER_TOKEN are required." >&2
  exit 1
fi

AUTH_HEADER="Authorization: Bearer $BEARER_TOKEN"
CAPTURED=()

# ---------------------------------------------------------------------------
# Helper: fetch and save
# ---------------------------------------------------------------------------

fetch_and_save() {
  local endpoint="$1"
  local outfile="$2"
  local url="${BASE_URL}${endpoint}"

  echo "Fetching GET ${endpoint} ..."

  # Capture both body and status code
  local tmp
  tmp="$(mktemp)"
  local body
  body="$(curl -sS -w "\n%{http_code}" -H "$AUTH_HEADER" "$url" -o "$tmp" -w "%{http_code}" 2>/dev/null || true)"
  local status_code
  status_code="$(tail -1 "$tmp")"
  local http_body
  http_body="$(head -n -1 "$tmp")"
  rm -f "$tmp"

  # Alternative approach: use separate calls for body and status
  local response
  response="$(curl -sS -w "\n%{http_code}" -H "$AUTH_HEADER" "$url" 2>/dev/null)"
  status_code="$(echo "$response" | tail -1)"
  http_body="$(echo "$response" | sed '$d')"

  if [[ "$status_code" == "404" ]]; then
    echo "  Skipped (404 Not Found)"
    return 0
  fi

  if [[ "$status_code" != "200" && "$status_code" != "201" ]]; then
    echo "  Error: HTTP $status_code" >&2
    echo "  Response: $http_body" >&2
    return 1
  fi

  # Validate JSON
  if ! echo "$http_body" | jq . > /dev/null 2>&1; then
    echo "  Error: Invalid JSON response" >&2
    echo "  Body: $http_body" >&2
    return 1
  fi

  echo "$http_body" | jq . > "$FIXTURES_DIR/$outfile"
  echo "  Saved to tests/fixtures/$outfile"
  CAPTURED+=("GET ${endpoint} -> tests/fixtures/$outfile")
}

# ---------------------------------------------------------------------------
# Capture endpoints
# ---------------------------------------------------------------------------

# 1. Healthcheck (no auth)
echo "Fetching GET /healthcheck ..."
health_status="$(curl -sS -o /dev/null -w "%{http_code}" "${BASE_URL}/healthcheck" 2>/dev/null || true)"
echo "  /healthcheck status: $health_status"

# 2. Info (no auth required)
fetch_and_save "/info" "archive-info.json"

# 3. Projects
fetch_and_save "/projects" "archive-projects.json"

# 4. Per-project observations and alerts
if [[ -f "$FIXTURES_DIR/archive-projects.json" ]]; then
  # Extract project IDs from the captured response
  project_ids="$(jq -r '.data[]?.projectId // empty' "$FIXTURES_DIR/archive-projects.json" 2>/dev/null || true)"

  if [[ -n "$project_ids" ]]; then
    while IFS= read -r pid; do
      [[ -z "$pid" ]] && continue
      fetch_and_save "/projects/${pid}/observations" "archive-observations-${pid}.json" || true
      fetch_and_save "/projects/${pid}/remoteDetectionAlerts" "archive-alerts-${pid}.json" || true
    done <<< "$project_ids"
  else
    echo "No project IDs found in response. Skipping per-project endpoints."
  fi
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

echo ""
echo "=========================================="
echo " Capture Summary"
echo "=========================================="
echo "Base URL: $BASE_URL"
echo "Healthcheck: $health_status"
echo ""
echo "Captured endpoints:"
for entry in "${CAPTURED[@]}"; do
  echo "  $entry"
done
echo ""
echo "Total: ${#CAPTURED[@]} endpoints captured"
echo "Files saved to: tests/fixtures/"
