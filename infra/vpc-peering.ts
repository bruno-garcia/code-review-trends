import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import { EnvironmentConfig } from "./config";

/**
 * Bidirectional VPC peering between the CRT VPC and an external VPC.
 *
 * Used to give the migration-worker VM (on the external VPC) access to
 * ClickHouse on the CRT VPC's internal IP. Traffic flows over GCP's
 * internal network — no internet exposure.
 *
 * Both peering connections must be created for traffic to flow. GCP
 * auto-accepts peering within the same project.
 */
export function createVpcPeering(
  cfg: EnvironmentConfig,
  crtVpc: gcp.compute.Network,
  parent?: pulumi.Resource,
): void {
  if (!cfg.workerVpcNetwork) {
    return;
  }

  const prefix = cfg.namePrefix;

  // Reference the external VPC by name (it's managed outside Pulumi)
  const externalVpc = gcp.compute.Network.get(
    `${prefix}-worker-vpc`,
    cfg.workerVpcNetwork,
  );

  // CRT VPC → external VPC
  new gcp.compute.NetworkPeering(
    `${prefix}-to-worker-vpc`,
    {
      name: `${prefix}-to-worker-vpc`,
      network: crtVpc.selfLink,
      peerNetwork: externalVpc.selfLink,
      exportCustomRoutes: true,
      importCustomRoutes: true,
    },
    { parent },
  );

  // External VPC → CRT VPC
  new gcp.compute.NetworkPeering(
    `${prefix}-from-worker-vpc`,
    {
      name: `${prefix}-from-worker-vpc`,
      network: externalVpc.selfLink,
      peerNetwork: crtVpc.selfLink,
      exportCustomRoutes: true,
      importCustomRoutes: true,
    },
    { parent },
  );
}
