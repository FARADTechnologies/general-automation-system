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
  --set "ANTHROPIC_BASE_URL=$(get ANTHROPIC_BASE_URL)" \
  --set "ANTHROPIC_AUTH_TOKEN=$(get ANTHROPIC_AUTH_TOKEN)" \
  --set "AGENT_FALLBACK=$(get AGENT_FALLBACK)" \
  --set "AGENT_CACHE_TTL=$(get AGENT_CACHE_TTL)" \
  --set "GEMINI_API_KEY=$(get GEMINI_API_KEY)" \
  --set "AGENT_PROVIDER=${AGENT_PROVIDER:-$(get AGENT_PROVIDER)}" \
  --set "GEMINI_MODEL=${GEMINI_MODEL:-gemini-3.6-flash}" \
  --set "GEMINI_FALLBACKS=${GEMINI_FALLBACKS:-gemini-3-flash-preview,gemini-3.5-flash-lite,gemini-2.5-flash}" \
  --set "BRIDGE_CONSOLE_PASSCODE=$(get BRIDGE_CONSOLE_PASSCODE)" \
  --set "ELEVENLABS_API_KEY=$(get ELEVENLABS_API_KEY)" \
  --set "GROQ_API_KEY=$(get GROQ_API_KEY)" \
  --set "MISTRAL_API_KEY=$(get MISTRAL_API_KEY)" \
  --set "AGENT_MODEL=${AGENT_MODEL:-claude-sonnet-5-5}" \
  --set "AGENT_EFFORT=${AGENT_EFFORT:-medium}" \
  --set "AGENT_THINKING=${AGENT_THINKING:-between_tools}" \
  --set "SESSION_CALL_CAP=40" --set "SESSION_SPEND_CAP_USD=1.50" >/dev/null
railway up --service app --detach
railway domain --service app 2>/dev/null || true
