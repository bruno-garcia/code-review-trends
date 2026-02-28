import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import { EnvironmentConfig, CADDY_HTTPS_PORT } from "./config";
import { DISK_CHECK_STARTUP_SNIPPET } from "./monitoring";

export interface ClickHouseResult {
  vm: gcp.compute.Instance;
  internalIp: pulumi.Output<string>;
}

export function createClickHouseVM(
  cfg: EnvironmentConfig,
  vpcName: pulumi.Output<string>,
  subnetName: pulumi.Output<string>,
  externalIp: pulumi.Output<string>,
  clickhousePassword: pulumi.Output<string>,
  parent?: pulumi.Resource,
): ClickHouseResult {
  const prefix = cfg.namePrefix;

  // Build the list of IPs/CIDRs allowed to connect to ClickHouse.
  // Always includes localhost and the VPC subnet (for Cloud Run via Direct VPC Egress).
  // Optionally includes a specific worker IP for VPC-peered access.
  const allowedNetworks = [
    "127.0.0.1",
    "::1",
    cfg.subnetCidr,
    ...(cfg.workerIp ? [cfg.workerIp] : []),
  ];
  const networksXml = allowedNetworks
    .map((ip) => `        <ip>${ip}</ip>`)
    .join("\n");

  // Resolve domain + password so we have concrete string values for the
  // startup script. JS template literals handle all interpolation — no shell
  // variable expansion needed except for $CH_PASSWORD in the password heredoc.
  //
  // Only resolve domain if we need Caddy (public access)
  const startupScript = (
    cfg.clickhousePublicAccess && cfg.clickhouseDomain
      ? pulumi.all([clickhousePassword, cfg.clickhouseDomain])
      : pulumi.all([clickhousePassword]).apply(([pw]) => [pw, undefined] as [string, string | undefined])
  ).apply(([password, domain]) => {
      // Validate domain to prevent injection into the Caddyfile
      if (domain && !/^[a-zA-Z0-9.-]+$/.test(domain)) {
        throw new Error(`Invalid domain format: ${domain}`);
      }

      // Escape single quotes in password for shell safety
      const escapedPassword = password.replace(/'/g, "'\\''");

      const CLICKHOUSE_HTTP_PORT = cfg.clickhouseHttpPort;

      // --- Caddy section (only for public access) ---
      const caddyInstallSection = cfg.clickhousePublicAccess
        ? `
  # Caddy repo
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | \\
    gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg

  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | \\
    tee /etc/apt/sources.list.d/caddy-stable.list

  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y \\
    clickhouse-server \\
    clickhouse-client \\
    caddy`
        : `
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y \\
    clickhouse-server \\
    clickhouse-client`;

      const caddyCheckCondition = cfg.clickhousePublicAccess
        ? `! command -v clickhouse-server &>/dev/null || ! command -v caddy &>/dev/null`
        : `! command -v clickhouse-server &>/dev/null`;

      const caddyConfigSection = cfg.clickhousePublicAccess && domain
        ? `
# ---- Configure Caddy ----

# Use 127.0.0.1 explicitly — 'localhost' resolves to ::1 on Debian 12
# and ClickHouse only binds to IPv4
cat > /etc/caddy/Caddyfile <<'CADDYEOF'
${domain}:${CADDY_HTTPS_PORT} {
  reverse_proxy 127.0.0.1:${CLICKHOUSE_HTTP_PORT}
}
CADDYEOF

systemctl enable caddy
systemctl restart caddy

# ---- Health-check watchdog ----
# Restarts Caddy if it accepts TCP connections but stops responding to HTTP.
# Runs every 2 minutes via systemd timer.

cat > /etc/systemd/system/caddy-watchdog.service <<'WDEOF'
[Unit]
Description=Caddy health-check watchdog
After=caddy.service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/caddy-watchdog.sh
WDEOF

cat > /etc/systemd/system/caddy-watchdog.timer <<'WTEOF'
[Unit]
Description=Run Caddy watchdog every 2 minutes

[Timer]
OnBootSec=3min
OnUnitActiveSec=2min

[Install]
WantedBy=timers.target
WTEOF

cat > /usr/local/bin/caddy-watchdog.sh <<'WATCHEOF'
#!/bin/bash
# Check if Caddy responds to HTTP on port 80 within 5 seconds.
# Caddy always listens on :80 for ACME challenges and redirects.
# Any HTTP response (even a 308 redirect) proves Caddy is alive.
#
# -S: show curl errors in journald for diagnostics
# No -f: HTTP error codes (3xx/4xx/5xx) still mean Caddy is responding

# Don't check if Caddy isn't supposed to be running yet
if ! systemctl is-active --quiet caddy; then
  echo "Caddy is not active — skipping health check"
  exit 0
fi

if ! curl -S --max-time 5 -o /dev/null "http://127.0.0.1:80/" 2>&1; then
  echo "Caddy health check failed — restarting"
  systemctl restart caddy
else
  echo "Caddy health check passed"
fi
WATCHEOF
chmod +x /usr/local/bin/caddy-watchdog.sh

systemctl daemon-reload
systemctl enable caddy-watchdog.timer
systemctl start caddy-watchdog.timer`
        : `
# ---- No Caddy ----
# clickhousePublicAccess is false — ClickHouse is accessed internally only.
# No TLS termination needed; Cloud Run and workers connect via VPC.`;

      return `#!/bin/bash
set -euo pipefail

exec > >(tee /var/log/startup-script.log) 2>&1
echo "Starting ClickHouse setup at $(date)"

echo "nameserver 8.8.8.8" > /etc/resolv.conf
echo "nameserver 8.8.4.4" >> /etc/resolv.conf

# ---- Install packages (first boot only) ----

if ${caddyCheckCondition}; then
  echo "First boot — installing packages"

  apt-get update
  apt-get install -y apt-transport-https ca-certificates curl gnupg debian-keyring debian-archive-keyring

  # ClickHouse repo
  curl -fsSL 'https://packages.clickhouse.com/rpm/lts/repodata/repomd.xml.key' | \\
    gpg --batch --yes --dearmor -o /usr/share/keyrings/clickhouse-keyring.gpg

  echo "deb [signed-by=/usr/share/keyrings/clickhouse-keyring.gpg] \\
    https://packages.clickhouse.com/deb stable main" | \\
    tee /etc/apt/sources.list.d/clickhouse.list
${caddyInstallSection}
else
  echo "Packages already installed — skipping installation"
fi

# ---- Configure ClickHouse ----

# Listen on all interfaces — firewall rules control external access.
# Staging: only Caddy port (${CADDY_HTTPS_PORT}) is open to the internet;
#   the ClickHouse HTTP port (${CLICKHOUSE_HTTP_PORT}) is VPC-internal only.
# Prod: no public ports; Cloud Run reaches ClickHouse via Direct VPC Egress
#   on the internal IP.
cat > /etc/clickhouse-server/config.d/listen.xml <<'CFGEOF'
<clickhouse>
  <listen_host>0.0.0.0</listen_host>
  <http_port>${CLICKHOUSE_HTTP_PORT}</http_port>
</clickhouse>
CFGEOF

# Memory limits — use 90% of RAM (dedicated box), cap individual queries at 2GB
cat > /etc/clickhouse-server/config.d/memory.xml <<'MEMEOF'
<clickhouse>
  <max_server_memory_usage_to_ram_ratio>0.9</max_server_memory_usage_to_ram_ratio>
</clickhouse>
MEMEOF

cat > /etc/clickhouse-server/users.d/memory-limits.xml <<'MLEOF'
<clickhouse>
  <profiles>
    <default>
      <max_memory_usage>4000000000</max_memory_usage>
      <max_execution_time>60</max_execution_time>
      <join_algorithm>direct,parallel_hash,hash,grace_hash</join_algorithm>
    </default>
  </profiles>
</clickhouse>
MLEOF

# Set the default user password and compute SHA256 hash for config
CH_PASSWORD='${escapedPassword}'
CH_PASSWORD_HASH=$(printf "%s" "$CH_PASSWORD" | sha256sum | tr -d ' -')

cat > /etc/clickhouse-server/users.d/default-password.xml <<'PWEOF'
<clickhouse>
  <users>
    <default>
      <password_sha256_hex>PLACEHOLDER_HASH</password_sha256_hex>
      <networks>
${networksXml}
      </networks>
    </default>
  </users>
</clickhouse>
PWEOF
sed -i "s/PLACEHOLDER_HASH/$CH_PASSWORD_HASH/" /etc/clickhouse-server/users.d/default-password.xml

# Remove the empty <password></password> from users.xml — ClickHouse 26+ rejects
# having both 'password' and 'password_sha256_hex' for the same user, even when
# the override is in users.d/. The override file supplies password_sha256_hex.
sed -i -E '/^[[:space:]]*<password>[[:space:]]*<[/]password>[[:space:]]*$/d' /etc/clickhouse-server/users.xml

systemctl enable clickhouse-server
systemctl restart clickhouse-server
${caddyConfigSection}

# ---- Create database ----

ch_ready=""
for i in $(seq 1 30); do
  if clickhouse-client --port 9000 --password "$CH_PASSWORD" -q "SELECT 1" 2>/dev/null; then
    ch_ready="1"
    break
  fi
  sleep 2
done

if [ -z "$ch_ready" ]; then
  echo "ERROR: ClickHouse did not become ready within 60 seconds"
  exit 1
fi

clickhouse-client --port 9000 --password "$CH_PASSWORD" -q "CREATE DATABASE IF NOT EXISTS code_review_trends"

${DISK_CHECK_STARTUP_SNIPPET}

echo "Setup complete at $(date)"
`;
    });

  const vm = new gcp.compute.Instance(
    `${prefix}-clickhouse`,
    {
      name: `${prefix}-clickhouse`,
      machineType: cfg.clickhouseMachineType,
      zone: gcp.config.zone!,
      bootDisk: {
        autoDelete: false,
        initializeParams: {
          image: "debian-cloud/debian-12",
          size: cfg.clickhouseDiskSizeGb,
        },
      },
      networkInterfaces: [
        {
          network: vpcName,
          subnetwork: subnetName,
          accessConfigs: [
            {
              natIp: externalIp,
            },
          ],
        },
      ],
      metadataStartupScript: startupScript,
      tags: ["clickhouse"],
      allowStoppingForUpdate: true,
    },
    {
      parent,
      protect: true,
      ignoreChanges: ["metadataStartupScript", "metadata", "bootDisk"],
    },
  );

  const internalIp = vm.networkInterfaces.apply(
    (nics) => nics[0].networkIp!,
  );

  return { vm, internalIp };
}
