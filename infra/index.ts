import * as pulumi from "@pulumi/pulumi";
import { loadConfig, CADDY_HTTPS_PORT } from "./config";
import { createNetwork } from "./network";
import { createFirewallRules } from "./firewall";
import { createSecrets, createManagedSecret } from "./secrets";
import { createClickHouseVM } from "./clickhouse";
import { createServiceAccounts } from "./service-accounts";
import { createWorkloadIdentity } from "./workload-identity";
import { createArtifactRegistry } from "./artifact-registry";
import { createCloudRunApp } from "./cloud-run-app";
import { createCloudRunJobs } from "./cloud-run-jobs";
import { createBackups } from "./backups";
import { createDiskMonitoring } from "./monitoring";
import { createVpcPeering } from "./vpc-peering";

/**
 * How Cloud Run connects to ClickHouse.
 *
 * - Public access (staging): Cloud Run → internet → Caddy HTTPS → ClickHouse.
 *   No VPC access needed; CLICKHOUSE_URL uses the public domain.
 *
 * - Private access (prod): Cloud Run → VPC (Direct VPC Egress) → ClickHouse
 *   internal IP, plain HTTP. No internet exposure for ClickHouse.
 */
export interface ClickHouseAccess {
  url: pulumi.Output<string>;
  /** Set when clickhousePublicAccess is false — enables Direct VPC Egress on Cloud Run */
  vpcAccess?: {
    network: pulumi.Output<string>;
    subnetwork: pulumi.Output<string>;
  };
}

const cfg = loadConfig();

// Secrets: ClickHouse password in Secret Manager
const secrets = createSecrets(cfg);

// Network: VPC, subnet, router, NAT, static IP
const network = createNetwork(cfg);

// Firewall: SSH (IAP), ClickHouse HTTP (conditional), ClickHouse native (VPC-only)
createFirewallRules(cfg, network.vpc.name);

// ClickHouse VM with external IP and managed password
const clickhouse = createClickHouseVM(
  cfg,
  network.vpc.name,
  network.subnet.name,
  network.clickhouseExternalIp.address,
  secrets.clickhousePassword,
);

// Build ClickHouse access config based on environment
const chAccess: ClickHouseAccess = cfg.clickhousePublicAccess && cfg.clickhouseDomain
  ? {
      // Staging: public Caddy HTTPS endpoint
      url: pulumi.interpolate`https://${cfg.clickhouseDomain}:${CADDY_HTTPS_PORT}`,
    }
  : {
      // Prod: internal HTTP via VPC — no internet exposure
      url: pulumi.interpolate`http://${clickhouse.internalIp}:${cfg.clickhouseHttpPort}`,
      vpcAccess: {
        network: network.vpc.id,
        subnetwork: network.subnet.id,
      },
    };

// ClickHouse URL secret — used by workers.sh to connect without local config.
// Created after the VM so we have the actual URL (internal IP or domain).
const prefix = cfg.namePrefix;
createManagedSecret(
  `${prefix}-clickhouse-url`,
  `${prefix}-clickhouse-url`,
  chAccess.url,
);

// Service accounts: runtime (Cloud Run) and deploy (CI/CD)
const serviceAccounts = createServiceAccounts(cfg);

// Workload Identity Federation: GitHub Actions → deploy SA
const workloadIdentity = createWorkloadIdentity(cfg, serviceAccounts.deploySa);

// Artifact Registry: Docker container images (shared — production reuses staging's)
const artifactRegistry = cfg.skipArtifactRegistry
  ? undefined
  : createArtifactRegistry(cfg);

// Cloud Run: web application service
const cloudRunApp = createCloudRunApp(cfg, serviceAccounts.runtimeSa, secrets, chAccess);

// Cloud Run Jobs: pipeline batch jobs
createCloudRunJobs(cfg, serviceAccounts.runtimeSa, secrets, chAccess);

// Backups: weekly disk snapshots (production only — staging uses manual one-offs)
if (cfg.environment === "production") {
  createBackups(cfg, clickhouse.vm);
}

// Monitoring: disk usage alerting (all environments)
createDiskMonitoring(cfg, cfg.alertEmail);

// VPC peering: allow external worker VM to reach ClickHouse via internal IP.
// Only created when workerVpcNetwork is configured (e.g., production).
if (cfg.workerVpcNetwork) {
  createVpcPeering(cfg, network.vpc);
}

// Outputs — used by the app and pipeline
export const clickhouseExternalIp = network.clickhouseExternalIp.address;
export const clickhouseInternalIp = clickhouse.internalIp;
export const clickhouseVmName = clickhouse.vm.name;
export const clickhouseUrl = pulumi.secret(chAccess.url);
export const clickhousePassword = pulumi.secret(secrets.clickhousePassword);

// App hosting
export const appUrl = cloudRunApp.serviceUrl;

// Container registry (only available when not skipped)
export const artifactRegistryUrl = artifactRegistry?.registryUrl;

// CI auth (Workload Identity Federation)
// These are resource identifiers, not credentials — useless without the WIF trust.
export const workloadIdentityProvider = workloadIdentity.provider.name;
export const deployServiceAccountEmail = serviceAccounts.deploySa.email;

// Reference
export const runtimeServiceAccountEmail = serviceAccounts.runtimeSa.email;
