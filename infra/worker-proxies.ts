import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import { EnvironmentConfig } from "./config";

/**
 * HTTP CONNECT proxy VMs for distributing GitHub API traffic across multiple IPs.
 *
 * GitHub enforces secondary rate limits per source IP. When the enrichment
 * pipeline runs on the migration-worker VM, all requests share one outbound
 * IP (via Cloud NAT) and hit the secondary limit. These lightweight proxy VMs
 * each have their own external IP, giving the pipeline multiple outbound IPs.
 *
 * Architecture:
 *   migration-worker ──→ Cloud NAT (worker-nat-ip-0, direct)
 *                    ──→ nat-proxy-1 (tinyproxy:8888) → worker-nat-ip-1
 *                    ──→ nat-proxy-2 (tinyproxy:8888) → worker-nat-ip-2
 *                    ──→ nat-proxy-3 (tinyproxy:8888) → worker-nat-ip-3
 *
 * The pipeline uses PROXY_URLS env var to round-robin across these proxies.
 * See pipeline/src/enrichment/proxy-pool.ts.
 *
 * These resources live on the worker VPC (external, not the CRT VPC).
 * The migration-worker VM itself is NOT managed by Pulumi.
 * The Cloud NAT config on the worker VPC router is also manual — it must
 * be configured to use worker-nat-ip-0 for the migration-worker's direct
 * outbound traffic (MANUAL_ONLY allocation with that single IP).
 */

const TINYPROXY_PORT = 8888;

const TINYPROXY_STARTUP_SCRIPT = `#!/bin/bash
apt-get update && apt-get install -y tinyproxy
cat > /etc/tinyproxy/tinyproxy.conf << CONF
User tinyproxy
Group tinyproxy
Port ${TINYPROXY_PORT}
Listen 0.0.0.0
Timeout 600
Allow 10.0.0.0/24
ConnectPort 443
CONF
systemctl restart tinyproxy
systemctl enable tinyproxy
`;

export interface WorkerProxiesResult {
  /** Static IP addresses for the proxy VMs */
  proxyIps: gcp.compute.Address[];
  /** Internal IPs of the proxy VMs (for PROXY_URLS) */
  proxyInternalUrls: pulumi.Output<string>[];
}

export function createWorkerProxies(
  cfg: EnvironmentConfig,
  parent?: pulumi.Resource,
): WorkerProxiesResult | undefined {
  if (!cfg.workerProxyCount || cfg.workerProxyCount <= 0) return undefined;
  if (!cfg.workerVpcNetwork) {
    throw new Error("workerVpcNetwork is required when workerProxyCount > 0");
  }
  if (!cfg.workerSubnet) {
    throw new Error("workerSubnet is required when workerProxyCount > 0");
  }

  const count = cfg.workerProxyCount;
  const region = gcp.config.region!;
  const zone = gcp.config.zone!;

  // Reference the worker VPC and subnet (managed outside Pulumi)
  const workerVpc = gcp.compute.Network.get(
    "worker-proxy-vpc",
    cfg.workerVpcNetwork,
  );
  const workerSubnet = gcp.compute.Subnetwork.get(
    "worker-proxy-subnet",
    cfg.workerSubnet,
  );

  // Static external IPs for each proxy VM
  const proxyIps: gcp.compute.Address[] = [];
  for (let i = 1; i <= count; i++) {
    proxyIps.push(
      new gcp.compute.Address(
        `worker-nat-ip-${i}`,
        {
          name: `worker-nat-ip-${i}`,
          region,
          addressType: "EXTERNAL",
          networkTier: "PREMIUM",
        },
        { parent },
      ),
    );
  }

  // Firewall: allow migration-worker subnet → proxy VMs on tinyproxy port
  new gcp.compute.Firewall(
    "allow-nat-proxy",
    {
      name: "allow-nat-proxy",
      network: workerVpc.selfLink,
      allows: [{ protocol: "tcp", ports: [String(TINYPROXY_PORT)] }],
      sourceRanges: ["10.0.0.0/24"],
      targetTags: ["nat-proxy"],
      description:
        "Allow internal access to tinyproxy on nat-proxy VMs for IP rotation",
    },
    { parent },
  );

  // Proxy VMs — minimal e2-micro instances running tinyproxy
  const proxyInternalUrls: pulumi.Output<string>[] = [];
  for (let i = 1; i <= count; i++) {
    const vm = new gcp.compute.Instance(
      `nat-proxy-${i}`,
      {
        name: `nat-proxy-${i}`,
        machineType: "e2-micro",
        zone,
        tags: ["nat-proxy"],
        bootDisk: {
          initializeParams: {
            image: "debian-cloud/debian-12",
            size: 10,
          },
        },
        networkInterfaces: [
          {
            network: workerVpc.selfLink,
            subnetwork: workerSubnet.selfLink,
            accessConfigs: [
              {
                natIp: proxyIps[i - 1].address,
              },
            ],
          },
        ],
        metadata: {
          "startup-script": TINYPROXY_STARTUP_SCRIPT,
        },
        allowStoppingForUpdate: true,
        // Match GCE defaults — avoids replacement of imported VMs
        scheduling: {
          automaticRestart: true,
          onHostMaintenance: "MIGRATE",
          provisioningModel: "STANDARD",
        },
        serviceAccount: {
          scopes: [
            "https://www.googleapis.com/auth/devstorage.read_only",
            "https://www.googleapis.com/auth/logging.write",
            "https://www.googleapis.com/auth/monitoring.write",
            "https://www.googleapis.com/auth/service.management.readonly",
            "https://www.googleapis.com/auth/servicecontrol",
            "https://www.googleapis.com/auth/trace.append",
          ],
        },
      },
      { parent },
    );

    proxyInternalUrls.push(
      vm.networkInterfaces.apply(
        (ifaces) =>
          `http://${ifaces[0].networkIp}:${TINYPROXY_PORT}`,
      ),
    );
  }

  return { proxyIps, proxyInternalUrls };
}
