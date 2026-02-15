import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import {
  EnvironmentConfig,
  CLICKHOUSE_HTTP_PORT,
  CADDY_HTTPS_PORT,
} from "./config";

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

  // Build the startup script inside .apply() so we have concrete string values
  // for the password and domain. JS template literals handle all interpolation —
  // no shell variable expansion needed except for $CH_PASSWORD in the password
  // heredoc.
  //
  // Heredocs:
  //   <<'EOF' (single-quoted) — no shell expansion, only JS interpolation
  //   <<EOF   (unquoted)      — shell expansion happens ($CH_PASSWORD)
  //
  // The script is ignored after initial creation (ignoreChanges) so manual
  // config changes on the VM are preserved across pulumi up.
  const startupScript = pulumi
    .all([clickhousePassword, cfg.clickhouseDomain])
    .apply(([password, domain]) => {
      // Escape single quotes in password for shell safety
      const escapedPassword = password.replace(/'/g, "'\\''");

      return `#!/bin/bash
set -euo pipefail

exec > >(tee /var/log/startup-script.log) 2>&1
echo "Starting ClickHouse + Caddy setup at $(date)"

echo "nameserver 8.8.8.8" > /etc/resolv.conf
echo "nameserver 8.8.4.4" >> /etc/resolv.conf

apt-get update
apt-get install -y apt-transport-https ca-certificates curl gnupg debian-keyring debian-archive-keyring

# ---- ClickHouse ----

curl -fsSL 'https://packages.clickhouse.com/rpm/lts/repodata/repomd.xml.key' | \\
  gpg --dearmor -o /usr/share/keyrings/clickhouse-keyring.gpg

echo "deb [signed-by=/usr/share/keyrings/clickhouse-keyring.gpg] \\
  https://packages.clickhouse.com/deb stable main" | \\
  tee /etc/apt/sources.list.d/clickhouse.list

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y \\
  clickhouse-server \\
  clickhouse-client

# Listen on localhost only — Caddy handles external access
cat > /etc/clickhouse-server/config.d/listen.xml <<'CFGEOF'
<clickhouse>
  <listen_host>127.0.0.1</listen_host>
  <http_port>${CLICKHOUSE_HTTP_PORT}</http_port>
</clickhouse>
CFGEOF

# Set the default user password as a shell variable for use in heredoc and commands
CH_PASSWORD='${escapedPassword}'

cat > /etc/clickhouse-server/users.d/default-password.xml <<PWEOF
<clickhouse>
  <users>
    <default>
      <password>$CH_PASSWORD</password>
      <networks>
        <ip>::/0</ip>
      </networks>
    </default>
  </users>
</clickhouse>
PWEOF

systemctl enable clickhouse-server
systemctl restart clickhouse-server

# ---- Caddy ----

curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | \\
  gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg

curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | \\
  tee /etc/apt/sources.list.d/caddy-stable.list

apt-get update
apt-get install -y caddy

# Caddy config: TLS reverse proxy on non-standard port
cat > /etc/caddy/Caddyfile <<'CADDYEOF'
${domain}:${CADDY_HTTPS_PORT} {
  reverse_proxy localhost:${CLICKHOUSE_HTTP_PORT}
}
CADDYEOF

systemctl enable caddy
systemctl restart caddy

# ---- Create database ----

for i in $(seq 1 30); do
  clickhouse-client --port 9000 --password "$CH_PASSWORD" -q "SELECT 1" 2>/dev/null && break
  sleep 2
done

clickhouse-client --port 9000 --password "$CH_PASSWORD" -q "CREATE DATABASE IF NOT EXISTS code_review_trends"

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
