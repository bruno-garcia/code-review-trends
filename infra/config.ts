import * as pulumi from "@pulumi/pulumi";

const PROJECT_PREFIX = "crt";

export const CLICKHOUSE_HTTP_PORT = 41923;
export const CADDY_HTTPS_PORT = 58432;
export const SUBNET_CIDR = "10.100.0.0/24";

export interface EnvironmentConfig {
  environment: string;
  clickhouseMachineType: string;
  clickhouseDiskSizeGb: number;
  clickhouseDomain: pulumi.Output<string>;
  /** Resource name prefix: crt-{env} */
  namePrefix: string;
}

export function loadConfig(): EnvironmentConfig {
  const config = new pulumi.Config();

  const environment = config.require("environment");

  return {
    environment,
    clickhouseMachineType: config.require("clickhouseMachineType"),
    clickhouseDiskSizeGb: config.requireNumber("clickhouseDiskSizeGb"),
    clickhouseDomain: config.requireSecret("clickhouseDomain"),
    namePrefix: `${PROJECT_PREFIX}-${environment}`,
  };
}
