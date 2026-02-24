import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import { EnvironmentConfig } from "./config";

export interface NetworkResult {
  vpc: gcp.compute.Network;
  subnet: gcp.compute.Subnetwork;
  clickhouseExternalIp: gcp.compute.Address;
}

export function createNetwork(
  cfg: EnvironmentConfig,
  parent?: pulumi.Resource,
): NetworkResult {
  const prefix = cfg.namePrefix;

  const vpc = new gcp.compute.Network(
    `${prefix}-vpc`,
    {
      name: `${prefix}-vpc`,
      autoCreateSubnetworks: false,
    },
    { parent },
  );

  const subnet = new gcp.compute.Subnetwork(
    `${prefix}-subnet`,
    {
      name: `${prefix}-subnet`,
      ipCidrRange: cfg.subnetCidr,
      network: vpc.id,
      region: gcp.config.region!,
    },
    { parent },
  );

  // Cloud Router + NAT so the VM can reach the internet (apt-get, etc.)
  const router = new gcp.compute.Router(
    `${prefix}-router`,
    {
      name: `${prefix}-router`,
      region: gcp.config.region!,
      network: vpc.id,
    },
    { parent },
  );

  new gcp.compute.RouterNat(
    `${prefix}-nat`,
    {
      name: `${prefix}-nat`,
      router: router.name,
      region: router.region,
      natIpAllocateOption: "AUTO_ONLY",
      sourceSubnetworkIpRangesToNat: "ALL_SUBNETWORKS_ALL_IP_RANGES",
    },
    { parent },
  );

  // Static external IP for ClickHouse — this is what Vercel connects to
  const clickhouseExternalIp = new gcp.compute.Address(
    `${prefix}-clickhouse-ip`,
    {
      name: `${prefix}-clickhouse-ip`,
      region: gcp.config.region!,
      addressType: "EXTERNAL",
    },
    { parent },
  );

  return { vpc, subnet, clickhouseExternalIp };
}
