import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import { EnvironmentConfig, CADDY_HTTPS_PORT } from "./config";

export function createFirewallRules(
  cfg: EnvironmentConfig,
  vpcName: pulumi.Output<string>,
  parent?: pulumi.Resource,
): void {
  const prefix = cfg.namePrefix;

  // SSH access (for administration via IAP or direct)
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

  // HTTPS (Caddy reverse proxy) — open to the internet for Vercel access
  // Caddy terminates TLS and proxies to ClickHouse on localhost
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

  // ClickHouse native protocol (9000) — only from within the VPC
  // Used by the pipeline if it ever runs inside GCP
  new gcp.compute.Firewall(
    `${prefix}-clickhouse-native`,
    {
      name: `${prefix}-clickhouse-native`,
      network: vpcName,
      allows: [{ protocol: "tcp", ports: ["9000"] }],
      sourceRanges: ["10.100.0.0/24"],
      targetTags: ["clickhouse"],
    },
    { parent },
  );
}
