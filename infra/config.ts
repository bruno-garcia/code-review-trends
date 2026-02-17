import * as pulumi from "@pulumi/pulumi";

const PROJECT_PREFIX = "crt";

export const CLICKHOUSE_HTTP_PORT = 41923;
export const CADDY_HTTPS_PORT = 58432;
export const SUBNET_CIDR = "10.100.0.0/24";

/** GCP default Cloud Run container — used only on first `pulumi up` before CI deploys. */
export const PLACEHOLDER_IMAGE =
  "us-docker.pkg.dev/cloudrun/container/hello";

export interface EnvironmentConfig {
  environment: string;
  clickhouseMachineType: string;
  clickhouseDiskSizeGb: number;
  clickhouseDomain: pulumi.Output<string>;
  /** Resource name prefix: crt-{env} */
  namePrefix: string;

  // App hosting
  appDomain: pulumi.Output<string>;

  // Container registry
  artifactRegistryLocation: string;

  // Secrets (stored in Pulumi config, created in Secret Manager)
  sentryDsnApp: pulumi.Output<string>;
  sentryDsnPipeline: pulumi.Output<string>;
  sentryAuthToken: pulumi.Output<string>;
  githubToken: pulumi.Output<string>;

  // WIF
  githubRepo: string;
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

    appDomain: config.requireSecret("appDomain"),
    artifactRegistryLocation: config.require("artifactRegistryLocation"),
    sentryDsnApp: config.requireSecret("sentryDsnApp"),
    sentryDsnPipeline: config.requireSecret("sentryDsnPipeline"),
    sentryAuthToken: config.requireSecret("sentryAuthToken"),
    githubToken: config.requireSecret("githubToken"),
    githubRepo: config.require("githubRepo"),
  };
}
