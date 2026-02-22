#!/usr/bin/env bash
#
# Enrichment worker manager for migration-worker VM.
#
# Reads GitHub tokens from GCP Secret Manager (JSON array),
# spawns one tmux worker per token, plus a status window.
#
# Usage:
#   ./workers.sh start    # Fetch tokens, start N workers in tmux
#   ./workers.sh stop     # Kill all workers
#   ./workers.sh status   # Show tail of each worker log
#   ./workers.sh update   # Stop → git pull → npm ci → start
#   ./workers.sh tokens   # Show token count + usernames + expiry
#
# Reentrant: start always kills existing session first.
# Logs: ~/worker-{0,1,...}.log

set -euo pipefail

REPO_DIR="$HOME/code-review-trends"
ENV_FILE="$REPO_DIR/.env.local"
SESSION="enrich"
SECRET_NAME="crt-staging-github-tokens"
PIPELINE_ENV="staging"
WORKER_LIMIT="50000"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[workers]${NC} $*"; }
warn() { echo -e "${YELLOW}[workers]${NC} $*"; }
err()  { echo -e "${RED}[workers]${NC} $*" >&2; }

fetch_tokens() {
  local raw
  raw=$(gcloud secrets versions access latest --secret="$SECRET_NAME" 2>/dev/null) || {
    err "Failed to fetch secret '$SECRET_NAME' from GCP Secret Manager"
    exit 1
  }
  # Parse JSON array into bash array
  mapfile -t TOKENS < <(echo "$raw" | python3 -c "import json,sys; [print(t) for t in json.load(sys.stdin)]")
  if [[ ${#TOKENS[@]} -eq 0 ]]; then
    err "No tokens found in secret '$SECRET_NAME'"
    exit 1
  fi
  log "Found ${#TOKENS[@]} token(s)"
}

cmd_start() {
  fetch_tokens
  local n=${#TOKENS[@]}

  # Load base env (CLICKHOUSE_URL, etc.)
  if [[ ! -f "$ENV_FILE" ]]; then
    err "Missing $ENV_FILE — need CLICKHOUSE_URL and CLICKHOUSE_PASSWORD"
    exit 1
  fi

  # Kill existing session (reentrant)
  tmux kill-session -t "$SESSION" 2>/dev/null && warn "Killed existing tmux session"

  log "Starting $n worker(s) in tmux session '$SESSION'"

  for i in $(seq 0 $((n - 1))); do
    local wname="worker${i}"
    local logfile="$HOME/worker-${i}.log"
    local token="${TOKENS[$i]}"

    # Build the worker command — override GITHUB_TOKEN per worker
    local cmd="cd $REPO_DIR && export \$(grep -v '^#' $ENV_FILE | xargs) && export GITHUB_TOKEN='${token}' && npm run pipeline -- enrich --env $PIPELINE_ENV --limit $WORKER_LIMIT --worker-id $i --total-workers $n --no-sentry 2>&1 | tee $logfile"

    if [[ $i -eq 0 ]]; then
      tmux new-session -d -s "$SESSION" -n "$wname"
    else
      tmux new-window -t "$SESSION" -n "$wname"
    fi
    tmux send-keys -t "$SESSION:$wname" "$cmd" Enter
    log "  $wname → token ${token:0:15}... → $logfile"
  done

  # Status window
  tmux new-window -t "$SESSION" -n status
  tmux send-keys -t "$SESSION:status" "cd $REPO_DIR && watch -n 60 'export \$(grep -v \"^#\" $ENV_FILE | xargs) && npm run pipeline -- enrich-status --env $PIPELINE_ENV --no-sentry 2>&1 | tail -40'" Enter

  # Select first worker window
  tmux select-window -t "$SESSION:worker0"

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
  for logfile in "$HOME"/worker-*.log; do
    [[ -f "$logfile" ]] || continue
    echo -e "${GREEN}=== $(basename "$logfile") (last 5 lines) ===${NC}"
    tail -5 "$logfile"
    echo ""
  done
}

cmd_update() {
  log "Stopping workers..."
  cmd_stop

  log "Pulling latest code..."
  cd "$REPO_DIR"
  git pull --ff-only

  log "Installing dependencies..."
  npm ci 2>&1 | tail -3

  log "Starting workers..."
  cmd_start
}

cmd_tokens() {
  fetch_tokens
  local n=${#TOKENS[@]}
  log "$n token(s) in secret '$SECRET_NAME':"
  echo ""
  for i in $(seq 0 $((n - 1))); do
    local token="${TOKENS[$i]}"
    local info
    info=$(gh api user -H "Authorization: token $token" --include 2>&1) || {
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

case "${1:-}" in
  start)  cmd_start  ;;
  stop)   cmd_stop   ;;
  status) cmd_status ;;
  update) cmd_update ;;
  tokens) cmd_tokens ;;
  *)
    echo "Usage: $0 {start|stop|status|update|tokens}"
    echo ""
    echo "  start   Fetch tokens from Secret Manager, start N workers in tmux"
    echo "  stop    Kill all workers"
    echo "  status  Show worker logs"
    echo "  update  Stop → git pull → npm ci → start"
    echo "  tokens  Show token usernames and expiry dates"
    exit 1
    ;;
esac
