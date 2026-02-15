import * as pulumi from "@pulumi/pulumi";
import { loadConfig, CADDY_HTTPS_PORT } from "./config";
import { createNetwork } from "./network";
import { createFirewallRules } from "./firewall";
import { createSecrets } from "./secrets";
import { createClickHouseVM } from "./clickhouse";

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

// Outputs — used by the app and pipeline
export const clickhouseExternalIp = network.clickhouseExternalIp.address;
export const clickhouseInternalIp = clickhouse.internalIp;
export const clickhouseVmName = clickhouse.vm.name;
export const clickhouseUrl = pulumi.secret(pulumi.interpolate`https://${cfg.clickhouseDomain}:${CADDY_HTTPS_PORT}`);
export const clickhousePassword = pulumi.secret(secrets.clickhousePassword);
