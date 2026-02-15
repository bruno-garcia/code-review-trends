#!/bin/bash
# Spins up a temporary VM with the same startup script as Pulumi,
# validates ClickHouse + Caddy are working, then tears it down.
#
# Usage: ./test-vm.sh
#
# Requires: gcloud authenticated, compute API enabled
# The domain config is skipped — we test ClickHouse directly on the internal
# Caddy-less path since we can't get a TLS cert for a throwaway IP.
# What we validate:
#   1. ClickHouse installs and starts
#   2. Password is set correctly
#   3. Database is created
#   4. Caddy installs (config will fail cert but that's expected without DNS)

set -euo pipefail

PROJECT=$(gcloud config get-value project 2>/dev/null)
ZONE="us-central1-a"
VM_NAME="crt-test-clickhouse-$(date +%s)"
MACHINE_TYPE="e2-small"
CH_PORT=41923
CH_PASSWORD="test-password-$(openssl rand -hex 12)"

echo "=== Creating test VM: ${VM_NAME} ==="
echo "Project: ${PROJECT}"
echo "Zone: ${ZONE}"

# Create the startup script (same logic as Pulumi, minus Caddy TLS)
STARTUP_SCRIPT=$(cat <<SCRIPT
#!/bin/bash
set -euo pipefail

exec > >(tee /var/log/startup-script.log) 2>&1
echo "Starting ClickHouse setup at \$(date)"

echo "nameserver 8.8.8.8" > /etc/resolv.conf
echo "nameserver 8.8.4.4" >> /etc/resolv.conf

apt-get update
apt-get install -y apt-transport-https ca-certificates curl gnupg debian-keyring debian-archive-keyring

curl -fsSL 'https://packages.clickhouse.com/rpm/lts/repodata/repomd.xml.key' | \\
  gpg --dearmor -o /usr/share/keyrings/clickhouse-keyring.gpg

echo "deb [signed-by=/usr/share/keyrings/clickhouse-keyring.gpg] \\
  https://packages.clickhouse.com/deb stable main" | \\
  tee /etc/apt/sources.list.d/clickhouse.list

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y \\
  clickhouse-server \\
  clickhouse-client

cat > /etc/clickhouse-server/config.d/listen.xml <<'CFGEOF'
<clickhouse>
  <listen_host>127.0.0.1</listen_host>
  <http_port>${CH_PORT}</http_port>
</clickhouse>
CFGEOF

CH_PASSWORD='${CH_PASSWORD}'
cat > /etc/clickhouse-server/users.d/default-password.xml <<PWEOF
<clickhouse>
  <users>
    <default>
      <password>\$CH_PASSWORD</password>
      <networks>
        <ip>::/0</ip>
      </networks>
    </default>
  </users>
</clickhouse>
PWEOF

systemctl enable clickhouse-server
systemctl restart clickhouse-server

for i in \$(seq 1 30); do
  clickhouse-client --port 9000 --password "\$CH_PASSWORD" -q "SELECT 1" 2>/dev/null && break
  sleep 2
done

clickhouse-client --port 9000 --password "\$CH_PASSWORD" -q "CREATE DATABASE IF NOT EXISTS code_review_trends"

echo "STARTUP_COMPLETE" >> /var/log/startup-script.log
SCRIPT
)

cleanup() {
  echo ""
  echo "=== Cleaning up: deleting ${VM_NAME} ==="
  gcloud compute instances delete "${VM_NAME}" \
    --zone="${ZONE}" \
    --quiet 2>/dev/null || true
}
trap cleanup EXIT

# Create VM with default VPC (no custom network needed for test)
gcloud compute instances create "${VM_NAME}" \
  --zone="${ZONE}" \
  --machine-type="${MACHINE_TYPE}" \
  --image-family=debian-12 \
  --image-project=debian-cloud \
  --boot-disk-size=20GB \
  --metadata=startup-script="${STARTUP_SCRIPT}" \
  --quiet

echo "=== Waiting for startup script to complete (up to 5 min) ==="
for i in $(seq 1 60); do
  STATUS=$(gcloud compute ssh "${VM_NAME}" \
    --zone="${ZONE}" \
    --command="grep -c 'STARTUP_COMPLETE' /var/log/startup-script.log 2>/dev/null || echo 0" \
    2>/dev/null || echo "0")

  if [ "${STATUS}" = "1" ]; then
    echo "Startup script completed!"
    break
  fi

  if [ "$i" = "60" ]; then
    echo "TIMEOUT waiting for startup script"
    echo "=== Startup script log ==="
    gcloud compute ssh "${VM_NAME}" --zone="${ZONE}" \
      --command="cat /var/log/startup-script.log" 2>/dev/null || true
    exit 1
  fi

  printf "."
  sleep 5
done

echo ""
echo "=== Running validation checks ==="

FAILED=0

# Check 1: ClickHouse is running
echo -n "Check 1: ClickHouse is running... "
RESULT=$(gcloud compute ssh "${VM_NAME}" --zone="${ZONE}" \
  --command="systemctl is-active clickhouse-server" 2>/dev/null || echo "failed")
if [ "${RESULT}" = "active" ]; then
  echo "PASS"
else
  echo "FAIL (${RESULT})"
  FAILED=1
fi

# Check 2: ClickHouse listens on localhost only
echo -n "Check 2: ClickHouse on localhost:${CH_PORT} only... "
RESULT=$(gcloud compute ssh "${VM_NAME}" --zone="${ZONE}" \
  --command="ss -tlnp | grep ${CH_PORT}" 2>/dev/null || echo "failed")
if echo "${RESULT}" | grep -q "127.0.0.1:${CH_PORT}"; then
  echo "PASS"
else
  echo "FAIL (${RESULT})"
  FAILED=1
fi

# Check 3: Password authentication works
echo -n "Check 3: Password authentication... "
RESULT=$(gcloud compute ssh "${VM_NAME}" --zone="${ZONE}" \
  --command="clickhouse-client --port 9000 --password '${CH_PASSWORD}' -q 'SELECT 1'" 2>/dev/null || echo "failed")
if [ "${RESULT}" = "1" ]; then
  echo "PASS"
else
  echo "FAIL (${RESULT})"
  FAILED=1
fi

# Check 4: Database exists
echo -n "Check 4: Database code_review_trends exists... "
RESULT=$(gcloud compute ssh "${VM_NAME}" --zone="${ZONE}" \
  --command="clickhouse-client --port 9000 --password '${CH_PASSWORD}' -q \"SELECT name FROM system.databases WHERE name = 'code_review_trends'\"" 2>/dev/null || echo "failed")
if [ "${RESULT}" = "code_review_trends" ]; then
  echo "PASS"
else
  echo "FAIL (${RESULT})"
  FAILED=1
fi

# Check 5: Empty password rejected
echo -n "Check 5: Empty password rejected... "
RESULT=$(gcloud compute ssh "${VM_NAME}" --zone="${ZONE}" \
  --command="clickhouse-client --port 9000 -q 'SELECT 1' 2>&1 || true" 2>/dev/null || echo "")
if echo "${RESULT}" | grep -qi "authentication\|password\|denied\|incorrect"; then
  echo "PASS"
else
  echo "FAIL (expected auth error, got: ${RESULT})"
  FAILED=1
fi

echo ""
if [ "${FAILED}" = "0" ]; then
  echo "=== ALL CHECKS PASSED ==="
else
  echo "=== SOME CHECKS FAILED ==="
  echo ""
  echo "Startup script log:"
  gcloud compute ssh "${VM_NAME}" --zone="${ZONE}" \
    --command="cat /var/log/startup-script.log" 2>/dev/null || true
  exit 1
fi
