#!/usr/bin/env bash
#
# Enrichment worker manager for migration-worker VM.
#
# Fetches ALL config from GCP Secret Manager — no .env.local needed.
# Spawns one tmux worker per GitHub token, plus a status window.
#
# Usage:
#   ./workers.sh <env> start    # Fetch secrets, start N workers in tmux
#   ./workers.sh <env> stop     # Kill all workers
#   ./workers.sh <env> status   # Show tail of each worker log
#   ./workers.sh <env> update   # Stop → git pull → npm ci → start
#   ./workers.sh <env> tokens   # Show token count + usernames + expiry
#
# <env> is required: staging, production, development
# Secrets are derived from env: crt-<env>-*
#
# Reentrant: start always kills existing session first.
# Logs: ~/worker-<env>-{1,2,...}.log

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[workers]${NC} $*"; }
warn() { echo -e "${YELLOW}[workers]${NC} $*"; }
err()  { echo -e "${RED}[workers]${NC} $*" >&2; }

# --- Parse env argument ---

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <env> {start|stop|status|update|tokens}"
  echo ""
  echo "  <env>     staging | production | development"
  echo ""
  echo "  start     Fetch secrets from GCP, start N workers in tmux"
  echo "  stop      Kill all workers"
  echo "  status    Show worker logs"
  echo "  update    Stop → git pull → npm ci → start"
  echo "  tokens    Show token usernames and expiry dates"
  exit 1
fi

PIPELINE_ENV="$1"
COMMAND="$2"

case "$PIPELINE_ENV" in
  staging|production|development) ;;
  *)
    err "Invalid environment: $PIPELINE_ENV (must be staging, production, or development)"
    exit 1
    ;;
esac

REPO_DIR="$HOME/code-review-trends"
SESSION="enrich-${PIPELINE_ENV}"
GCP_PROJECT="nuget-trends"
PREFIX="crt-${PIPELINE_ENV}"
WORKER_LIMIT="50000"

# ClickHouse URL is infrastructure config (not a secret).
# The hostname is the same for all environments — only the password differs.
CLICKHOUSE_URL="https://ch-crt.brunogarcia.com:58432"
CLICKHOUSE_DB="code_review_trends"

# --- Secret fetching ---

fetch_secret() {
  local name="$1"
  local value
  value=$(gcloud secrets versions access latest --secret="$name" --project="$GCP_PROJECT" 2>/dev/null) || {
    err "Failed to fetch secret '$name' from GCP Secret Manager"
    err "Ensure the VM service account has secretmanager.versions.access on this secret"
    exit 1
  }
  echo "$value"
}

fetch_tokens() {
  local raw
  raw=$(fetch_secret "${PREFIX}-github-tokens")
  # Parse JSON array into bash array
  mapfile -t TOKENS < <(echo "$raw" | python3 -c "import json,sys; [print(t) for t in json.load(sys.stdin)]")
  if [[ ${#TOKENS[@]} -eq 0 ]]; then
    err "No tokens found in secret '${PREFIX}-github-tokens'"
    exit 1
  fi
  log "Found ${#TOKENS[@]} GitHub token(s)"
}

fetch_shared_secrets() {
  log "Fetching secrets from GCP Secret Manager (project: $GCP_PROJECT)..."
  CLICKHOUSE_PASSWORD=$(fetch_secret "${PREFIX}-clickhouse-password")
  SENTRY_DSN=$(fetch_secret "${PREFIX}-sentry-dsn-pipeline")
  log "  ClickHouse: $CLICKHOUSE_URL (password: ***)"
  log "  Sentry DSN: ${SENTRY_DSN:0:30}..."
}

# Build the shared CLI args that every worker command needs.
# These are passed explicitly — no env vars needed.
shared_cli_args() {
  echo "--clickhouse-url $(printf %q "$CLICKHOUSE_URL") --clickhouse-password $(printf %q "$CLICKHOUSE_PASSWORD") --sentry-dsn $(printf %q "$SENTRY_DSN")"
}

cmd_start() {
  fetch_shared_secrets
  fetch_tokens
  local n=${#TOKENS[@]}
  local cli_args
  cli_args=$(shared_cli_args)

  # Kill existing session (reentrant)
  tmux kill-session -t "$SESSION" 2>/dev/null && warn "Killed existing tmux session '$SESSION'"

  log "Starting $n worker(s) + status in tmux session '$SESSION' (env: $PIPELINE_ENV)"

  # Window 0: status monitor
  tmux new-session -d -s "$SESSION" -n status
  tmux send-keys -t "$SESSION:status" "cd $REPO_DIR && watch -n 60 'npm run pipeline -- enrich-status --env $PIPELINE_ENV ${cli_args} 2>&1 | tail -40'" Enter

  # Windows 1..N: workers (staggered 60s apart to avoid ClickHouse overload)
  for i in $(seq 0 $((n - 1))); do
    local display_id=$((i + 1))
    local wname="worker${display_id}"
    local logfile="$HOME/worker-${PIPELINE_ENV}-${display_id}.log"
    local token="${TOKENS[$i]}"

    # Build the worker command — override GITHUB_TOKEN per worker
    # Workers after the first sleep before starting to stagger ClickHouse queries
    # CLI --worker-id is 0-based (used for hash partitioning), display is 1-based
    local sleep_cmd=""
    if [[ $i -gt 0 ]]; then
      sleep_cmd="echo 'Worker ${display_id}/${n}: waiting $((i * 60))s to stagger start...' && sleep $((i * 60)) && "
    fi
    local escaped_token
    escaped_token=$(printf %q "${token}")
    # Loop continuously: run enrich, pause 30s, repeat.
    # The 30s pause lets ClickHouse merges settle between rounds.
    # Uses printf with %()T for timestamp (bash builtin, no subshell needed in single quotes).
    local cmd="${sleep_cmd}cd $REPO_DIR && while true; do echo \"--- Round starting at \$(date -u +%Y-%m-%dT%H:%M:%SZ) ---\"; npm run pipeline -- enrich --env $PIPELINE_ENV --limit $WORKER_LIMIT --worker-id $i --total-workers $n --gh-token ${escaped_token} ${cli_args} 2>&1; rc=\$?; echo \"--- Round finished (exit \$rc) at \$(date -u +%Y-%m-%dT%H:%M:%SZ) ---\"; if [ \$rc -ne 0 ]; then echo 'Non-zero exit, pausing 60s before retry...'; sleep 60; fi; echo 'Pausing 30s before next round...'; sleep 30; done | tee $logfile"

    tmux new-window -t "$SESSION" -n "$wname"
    tmux send-keys -t "$SESSION:$wname" "$cmd" Enter
    log "  $wname → token ${token:0:15}... (starts in ${i}m) → $logfile"
  done

  # Select status window
  tmux select-window -t "$SESSION:status"

  log "Done. Attach with: TERM=xterm-256color tmux attach -t $SESSION"
}

cmd_stop() {
  if tmux has-session -t "$SESSION" 2>/dev/null; then
    tmux kill-session -t "$SESSION"
    log "Stopped all workers (killed tmux session '$SESSION')"
  else
    warn "No tmux session '$SESSION' found"
  fi
}

cmd_status() {
  # Show tmux windows
  if tmux has-session -t "$SESSION" 2>/dev/null; then
    log "tmux session '$SESSION':"
    tmux list-windows -t "$SESSION"
    echo ""
  else
    warn "No tmux session '$SESSION' running"
  fi

  # Show tail of each worker log
  for logfile in "$HOME"/worker-${PIPELINE_ENV}-*.log; do
    [[ -f "$logfile" ]] || continue
    echo -e "${GREEN}=== $(basename "$logfile") (last 5 lines) ===${NC}"
    tail -5 "$logfile"
    echo ""
  done
}

cmd_update() {
  log "Stopping workers..."
  cmd_stop

  log "Checking out main and pulling latest..."
  cd "$REPO_DIR"
  git checkout main
  git pull --ff-only

  log "Installing dependencies..."
  npm ci 2>&1 | tail -3

  log "Starting workers..."
  cmd_start
}

cmd_tokens() {
  fetch_tokens
  local n=${#TOKENS[@]}
  log "$n token(s) in secret '${PREFIX}-github-tokens':"
  echo ""
  for i in $(seq 0 $((n - 1))); do
    local token="${TOKENS[$i]}"
    local info
    info=$(GH_TOKEN="$token" gh api user --include 2>&1) || {
      echo "  [$i] ${token:0:15}... → INVALID"
      continue
    }
    local login expiry
    login=$(echo "$info" | grep -o '"login":"[^"]*"' | head -1 | cut -d\" -f4)
    expiry=$(echo "$info" | grep -i token-expiration | awk '{print $2, $3, $4}')
    echo "  [$i] $login — expires $expiry"
  done
}

# --- Main ---

case "$COMMAND" in
  start)  cmd_start  ;;
  stop)   cmd_stop   ;;
  status) cmd_status ;;
  update) cmd_update ;;
  tokens) cmd_tokens ;;
  *)
    err "Unknown command: $COMMAND"
    echo "Usage: $0 <env> {start|stop|status|update|tokens}"
    exit 1
    ;;
esac
