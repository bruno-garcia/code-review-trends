import * as pulumi from "@pulumi/pulumi";
import { loadConfig, CADDY_HTTPS_PORT } from "./config";
import { createNetwork } from "./network";
import { createFirewallRules } from "./firewall";
import { createSecrets } from "./secrets";
import { createClickHouseVM } from "./clickhouse";
import { createServiceAccounts } from "./service-accounts";
import { createWorkloadIdentity } from "./workload-identity";
import { createArtifactRegistry } from "./artifact-registry";
import { createCloudRunApp } from "./cloud-run-app";
import { createCloudRunJobs } from "./cloud-run-jobs";

const cfg = loadConfig();

// Secrets: ClickHouse password in Secret Manager
const secrets = createSecrets(cfg);

// Network: VPC, subnet, router, NAT, static IP
const network = createNetwork(cfg);

// Firewall: SSH (IAP), ClickHouse HTTP (public), ClickHouse native (VPC-only)
createFirewallRules(cfg, network.vpc.name);

// ClickHouse VM with external IP and managed password
const clickhouse = createClickHouseVM(
  cfg,
  network.vpc.name,
  network.subnet.name,
  network.clickhouseExternalIp.address,
  secrets.clickhousePassword,
);

// Service accounts: runtime (Cloud Run) and deploy (CI/CD)
const serviceAccounts = createServiceAccounts(cfg);

// Workload Identity Federation: GitHub Actions → deploy SA
const workloadIdentity = createWorkloadIdentity(cfg, serviceAccounts.deploySa);

// Artifact Registry: Docker container images
const artifactRegistry = createArtifactRegistry(cfg);

// Cloud Run: web application service
const cloudRunApp = createCloudRunApp(cfg, serviceAccounts.runtimeSa, secrets);

// Cloud Run Jobs: pipeline batch jobs
createCloudRunJobs(cfg, serviceAccounts.runtimeSa, secrets);

// Outputs — used by the app and pipeline
export const clickhouseExternalIp = network.clickhouseExternalIp.address;
export const clickhouseInternalIp = clickhouse.internalIp;
export const clickhouseVmName = clickhouse.vm.name;
export const clickhouseUrl = pulumi.secret(pulumi.interpolate`https://${cfg.clickhouseDomain}:${CADDY_HTTPS_PORT}`);
export const clickhousePassword = pulumi.secret(secrets.clickhousePassword);

// App hosting
export const appUrl = cloudRunApp.serviceUrl;

// Container registry
export const artifactRegistryUrl = artifactRegistry.registryUrl;

// CI auth (Workload Identity Federation)
// These are resource identifiers, not credentials — useless without the WIF trust.
export const workloadIdentityProvider = workloadIdentity.provider.name;
export const deployServiceAccountEmail = serviceAccounts.deploySa.email;

// Reference
export const runtimeServiceAccountEmail = serviceAccounts.runtimeSa.email;
