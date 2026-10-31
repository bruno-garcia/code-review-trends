#!/bin/bash
# Upgrades ClickHouse on an existing VM to clickhouseVersion from Pulumi.<stack>.yaml.
#
# New VMs install that version from their startup script; existing ones ignore
# startup script changes (ignoreChanges in clickhouse.ts). Older VMs' startup
# scripts also reinstall ClickHouse unpinned on every boot, so this pins the
# version in apt, which turns that reinstall into a no-op.
#
# Snapshots the VM's disks first. ClickHouse doesn't guarantee downgrades, so
# the script refuses them and the way back from a bad upgrade is restoring that
# snapshot (see README.md § "Upgrading ClickHouse"). Afterwards it lists system
# log tables the new version left behind; drop them manually.
#
# Requires gcloud access to the project (the active gcloud project), including
# IAP tunneling and creating disk snapshots.
#
# Usage: ./upgrade-clickhouse.sh [production|staging] [--yes]

set -euo pipefail

STACK="${1:-}"
if [[ "$STACK" != "production" && "$STACK" != "staging" ]]; then
  echo "Usage: $0 [production|staging] [--yes]"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_CONFIG="$SCRIPT_DIR/Pulumi.$STACK.yaml"
VM="crt-$STACK-clickhouse"

# Reads a plain (non-secret) value from the stack config.
stack_value() {
  sed -nE "s/^ *$1: *\"?([^\"]+)\"? *\$/\\1/p" "$STACK_CONFIG"
}

VERSION=$(stack_value 'code-review-trends:clickhouseVersion')
if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "No full clickhouseVersion (e.g. 26.8.36.3) in $STACK_CONFIG."
  exit 1
fi
# Same default as DEFAULT_CLICKHOUSE_HTTP_PORT in config.ts.
HTTP_PORT=$(stack_value 'code-review-trends:clickhouseHttpPort')
HTTP_PORT="${HTTP_PORT:-41923}"
ZONE=$(stack_value 'gcp:zone')
ZONE="${ZONE:-us-central1-a}"
# gcp:project is a secret in the stack config, so use the active gcloud project (as test-vm.sh does).
PROJECT=$(gcloud config get-value project 2>/dev/null)
if [[ -z "$PROJECT" ]]; then
  echo "No active gcloud project. Run: gcloud config set project <project-id>"
  exit 1
fi

status=$(gcloud compute instances describe "$VM" --zone="$ZONE" --project="$PROJECT" --format='value(status)')
if [[ "$status" != "RUNNING" ]]; then
  echo "$VM is $status. Start it first."
  exit 1
fi

if [[ "${2:-}" != "--yes" ]]; then
  read -r -p "This snapshots $VM's disks, upgrades ClickHouse to $VERSION and restarts it (brief ClickHouse outage). Continue? [y/N] " answer
  [[ "$answer" == "y" || "$answer" == "Y" ]] || exit 1
fi

# Crash-consistent snapshots of the running VM: ClickHouse writes parts atomically and recovers as after a power loss.
stamp=$(date -u +%Y%m%d%H%M)
snapshots=()
for disk in $(gcloud compute instances describe "$VM" --zone="$ZONE" --project="$PROJECT" \
    --flatten='disks[]' --format='value(disks.source.basename())'); do
  name="${disk:0:30}-pre-${VERSION//./-}-$stamp"
  echo "Snapshotting $disk as $name..."
  gcloud compute disks snapshot "$disk" --zone="$ZONE" --project="$PROJECT" --snapshot-names="$name" --quiet
  snapshots+=("$disk <- $name")
done

echo "Upgrading ClickHouse on $VM to $VERSION..."

if ! {
  printf 'VERSION=%q\nHTTP_PORT=%q\n' "$VERSION" "$HTTP_PORT"
  cat <<'REMOTE'
set -euo pipefail

MIN_AVAIL_GB=10
PACKAGES=(clickhouse-common-static clickhouse-server clickhouse-client)

write_pin() {
  # Older VMs' startup scripts run an unpinned `apt-get install clickhouse-server` on every boot.
  # With this pin it resolves to $VERSION instead of the newest package.
  cat > /etc/apt/preferences.d/clickhouse <<PIN
Package: ${PACKAGES[*]}
Pin: version $VERSION
Pin-Priority: 1001
PIN
  # Simulate that unpinned install: with the pin in effect it must not change anything.
  local simulated
  simulated=$(apt-get install -s -y clickhouse-server)
  if grep '^Inst ' <<< "$simulated"; then
    echo "The apt pin isn't in effect: an unpinned install would still change ClickHouse (see above)."
    exit 1
  fi
}

# The new version rewrites system log tables whose definition changed, so keep headroom.
avail_gb=$(df --output=avail -BG / | tail -1 | tr -dc '0-9')
if (( avail_gb < MIN_AVAIL_GB )); then
  echo "Only ${avail_gb}G available on /. Free space first."
  exit 1
fi

installed=$(dpkg-query -W -f='${Version}' clickhouse-server)
echo "Installed: $installed. Target: $VERSION."
if [[ "$installed" == "$VERSION" ]]; then
  apt-get update -q
  write_pin
  echo "Already on $VERSION. Wrote the apt pin, nothing else to do."
  exit 0
fi
if dpkg --compare-versions "$installed" gt "$VERSION"; then
  echo "Refusing to downgrade: ClickHouse doesn't guarantee it. Restore a snapshot instead."
  exit 1
fi

apt-get update -q
# Captured first: `apt-cache … | grep -q` fails under pipefail when grep exits early and apt-cache gets SIGPIPE.
available=$(apt-cache madison clickhouse-server)
if ! grep -qF " $VERSION " <<< "$available"; then
  echo "clickhouse-server $VERSION isn't available from the configured apt sources (see apt-get update above)."
  exit 1
fi

# confold keeps the existing config.xml; our settings live in config.d and users.d.
DEBIAN_FRONTEND=noninteractive apt-get install -y \
  -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold \
  "${PACKAGES[@]/%/=$VERSION}"
# Only after the install: a pin to a version that isn't installed would upgrade ClickHouse on the next boot.
write_pin

echo "Restarting clickhouse-server..."
systemctl restart clickhouse-server
for _ in $(seq 1 150); do
  curl -fsS "http://localhost:$HTTP_PORT/ping" >/dev/null 2>&1 && break
  sleep 2
done
if ! curl -fsS "http://localhost:$HTTP_PORT/ping" >/dev/null 2>&1; then
  echo "ClickHouse did not answer /ping on port $HTTP_PORT within 300s on $VERSION."
  journalctl -u clickhouse-server --no-pager -n 30 || true
  exit 1
fi

pid=$(systemctl show -p MainPID --value clickhouse-server)
if [[ "$(readlink "/proc/$pid/exe")" == *"(deleted)"* ]]; then
  echo "clickhouse-server (PID $pid) is still running the replaced binary."
  exit 1
fi
echo "ClickHouse is up: $(clickhouse-server --version)"
df -h / | tail -1

# Inspect system tables through their metadata files: no credentials needed.
cd /var/lib/clickhouse
sysdir=$(readlink -f metadata/system)
leftovers=()
unbounded=()
echo ""
echo "System log tables:"
for sql in "$sysdir"/*_log*.sql; do
  [[ -f "$sql" ]] || continue
  table=$(basename "$sql" .sql)
  uuid=$(grep -o "UUID '[0-9a-f-]*'" "$sql" | head -1 | cut -d"'" -f2)
  size=$(du -sh "store/${uuid:0:3}/$uuid" 2>/dev/null | cut -f1)
  ttl=$(grep -qE '(^|[[:space:]])TTL[[:space:]]' "$sql" && echo "TTL" || echo "no TTL")
  printf '  %-40s %8s  %s\n' "$table" "${size:-?}" "$ttl"
  case "$table" in
    *_log_[0-9]*) leftovers+=("$table") ;;
    *) [[ "$ttl" == "TTL" ]] || unbounded+=("$table") ;;
  esac
done

if (( ${#unbounded[@]} > 0 )); then
  echo ""
  echo "Note: active system log tables without a TTL (add them to log-ttl.xml in clickhouse.ts if they grow): ${unbounded[*]}"
fi

if (( ${#leftovers[@]} > 0 )); then
  echo ""
  echo "Left behind by the upgrade (renamed because their definition changed). Drop them with clickhouse-client:"
  for table in "${leftovers[@]}"; do
    echo "  DROP TABLE system.$table SYNC SETTINGS max_table_size_to_drop = 0;"
  done
fi
REMOTE
} | gcloud compute ssh "$VM" \
  --zone="$ZONE" \
  --project="$PROJECT" \
  --tunnel-through-iap \
  --command='sudo bash -s'; then
  echo ""
  echo "Upgrade failed. Snapshots taken before it:"
  printf '  %s\n' "${snapshots[@]}"
  echo "If ClickHouse is broken on the new version, restore the boot disk from its snapshot (see README.md)."
  exit 1
fi
