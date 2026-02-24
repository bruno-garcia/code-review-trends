import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import { EnvironmentConfig, CADDY_HTTPS_PORT } from "./config";

export function createFirewallRules(
  cfg: EnvironmentConfig,
  vpcName: pulumi.Output<string>,
  parent?: pulumi.Resource,
): void {
  const prefix = cfg.namePrefix;

  // SSH access via IAP only (for administration)
  new gcp.compute.Firewall(
    `${prefix}-allow-ssh`,
    {
      name: `${prefix}-allow-ssh`,
      network: vpcName,
      allows: [{ protocol: "tcp", ports: ["22"] }],
      // IAP range for gcloud compute ssh --tunnel-through-iap
      sourceRanges: ["35.235.240.0/20"],
      targetTags: ["clickhouse"],
    },
    { parent },
  );

  if (cfg.clickhousePublicAccess) {
    // HTTPS (Caddy reverse proxy) — open to the internet.
    // Caddy terminates TLS and proxies to ClickHouse on localhost.
    // Used by staging where Cloud Run connects via the public domain.
    // Note: logical name kept as "clickhouse-http" to match existing Pulumi state
    new gcp.compute.Firewall(
      `${prefix}-clickhouse-http`,
      {
        name: `${prefix}-clickhouse-https`,
        network: vpcName,
        allows: [
          { protocol: "tcp", ports: [String(CADDY_HTTPS_PORT)] },
          { protocol: "tcp", ports: ["80"] },
        ],
        sourceRanges: ["0.0.0.0/0"],
        targetTags: ["clickhouse"],
      },
      { parent },
    );
  }

  // ClickHouse HTTP port — VPC-internal only.
  // Used by Cloud Run (via Direct VPC Egress) in prod, and available
  // for internal tooling in both environments.
  new gcp.compute.Firewall(
    `${prefix}-clickhouse-http-internal`,
    {
      name: `${prefix}-clickhouse-http-internal`,
      network: vpcName,
      allows: [{ protocol: "tcp", ports: [String(cfg.clickhouseHttpPort)] }],
      sourceRanges: [cfg.subnetCidr],
      targetTags: ["clickhouse"],
    },
    { parent },
  );

  // ClickHouse native protocol (9000) — only from within the VPC
  // Used by the pipeline if it ever runs inside GCP
  new gcp.compute.Firewall(
    `${prefix}-clickhouse-native`,
    {
      name: `${prefix}-clickhouse-native`,
      network: vpcName,
      allows: [{ protocol: "tcp", ports: ["9000"] }],
      sourceRanges: [cfg.subnetCidr],
      targetTags: ["clickhouse"],
    },
    { parent },
  );

  // Worker VM access — allow a specific external VM (e.g., migration-worker)
  // to reach ClickHouse HTTP port via VPC peering. Scoped to a single IP
  // rather than the entire peered subnet for tighter security.
  if (cfg.workerIp) {
    new gcp.compute.Firewall(
      `${prefix}-clickhouse-worker`,
      {
        name: `${prefix}-clickhouse-worker`,
        network: vpcName,
        allows: [{ protocol: "tcp", ports: [String(cfg.clickhouseHttpPort)] }],
        sourceRanges: [`${cfg.workerIp}/32`],
        targetTags: ["clickhouse"],
      },
      { parent },
    );
  }
}
