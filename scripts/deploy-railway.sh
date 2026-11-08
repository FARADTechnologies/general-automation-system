#!/usr/bin/env bash
# One-shot Railway deploy. Needs: `railway login` done and an active Railway plan.
# Secrets are read from the local .env and passed to Railway; they are never printed.
set -euo pipefail
cd "$(dirname "$0")/.."
get() { grep -E "^$1=" .env | head -1 | cut -d= -f2- | tr -d '\r'; }
railway status >/dev/null 2>&1 || railway init --name general-automation-system
railway add --service app >/dev/null 2>&1 || true
railway variables --service app \
  --set "ANTHROPIC_API_KEY=$(get ANTHROPIC_API_KEY)" \
  --set "BRIDGE_CONSOLE_PASSCODE=$(get BRIDGE_CONSOLE_PASSCODE)" \
  --set "AGENT_MODEL=${AGENT_MODEL:-claude-sonnet-5-5}" \
  --set "AGENT_EFFORT=${AGENT_EFFORT:-medium}" \
  --set "AGENT_THINKING=${AGENT_THINKING:-between_tools}" \
  --set "SESSION_CALL_CAP=40" --set "SESSION_SPEND_CAP_USD=1.50" >/dev/null
railway up --service app --detach
railway domain --service app 2>/dev/null || true
