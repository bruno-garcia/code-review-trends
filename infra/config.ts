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

  // Cloud Run app resource limits
  appMemory: string;
  appCpu: string;
  appMinInstances: number;
  appMaxInstances: number;
  /** Max concurrent requests per Cloud Run instance */
  appConcurrency: number;

  // Container registry
  artifactRegistryLocation: string;

  /**
   * Whether ClickHouse is accessible from the public internet.
   *
   * - true (staging): Caddy terminates TLS on a public port. Cloud Run
   *   connects via the external domain + HTTPS.
   * - false (prod): No public ClickHouse port. Cloud Run uses Direct VPC
   *   Egress to reach ClickHouse on its internal IP via plain HTTP.
   */
  clickhousePublicAccess: boolean;

  // Secrets (stored in Pulumi config, created in Secret Manager)
  /** Sentry DSN for the Next.js frontend (public — baked into client bundle) */
  sentryDsnAppFrontend: pulumi.Output<string>;
  /** Sentry DSN for the Next.js backend (private — runtime env var via Secret Manager) */
  sentryDsnAppBackend: pulumi.Output<string>;
  /** Sentry DSN for the pipeline CLI (private — runtime env var via Secret Manager) */
  sentryDsnPipeline: pulumi.Output<string>;
  sentryAuthToken: pulumi.Output<string>;
  githubToken: pulumi.Output<string>;

  // WIF
  githubRepo: string;

  // Monitoring
  alertEmail: pulumi.Output<string>;
}

function validateScaling(vals: {
  appMinInstances: number;
  appMaxInstances: number;
  appConcurrency: number;
}) {
  for (const [key, val] of Object.entries(vals)) {
    if (!Number.isFinite(val) || val < 0 || !Number.isInteger(val)) {
      throw new Error(`${key} must be a non-negative integer, got: ${val}`);
    }
  }
  if (vals.appMinInstances > vals.appMaxInstances) {
    throw new Error(
      `appMinInstances (${vals.appMinInstances}) must be <= appMaxInstances (${vals.appMaxInstances})`,
    );
  }
  return vals;
}

export function loadConfig(): EnvironmentConfig {
  const config = new pulumi.Config();

  const environment = config.require("environment");

  // Validate that githubToken is not empty
  const githubToken = config.requireSecret("githubToken").apply((token) => {
    if (!token || token.trim() === "") {
      throw new Error(
        "GitHub token cannot be empty. Set it with: pulumi config set code-review-trends:githubToken <pat> --secret"
      );
    }
    return token;
  });

  return {
    environment,
    clickhouseMachineType: config.require("clickhouseMachineType"),
    clickhouseDiskSizeGb: config.requireNumber("clickhouseDiskSizeGb"),
    clickhouseDomain: config.requireSecret("clickhouseDomain"),
    namePrefix: `${PROJECT_PREFIX}-${environment}`,

    appDomain: config.requireSecret("appDomain"),

    // Cloud Run app resource limits — tunable per environment.
    // Defaults are conservative; staging/prod stacks override via Pulumi config.
    appMemory: config.get("appMemory") ?? "2Gi",
    appCpu: config.get("appCpu") ?? "1",
    ...validateScaling({
      appMinInstances: config.getNumber("appMinInstances") ?? 1,
      appMaxInstances: config.getNumber("appMaxInstances") ?? 4,
      appConcurrency: config.getNumber("appConcurrency") ?? 40,
    }),

    artifactRegistryLocation: config.require("artifactRegistryLocation"),
    clickhousePublicAccess: config.getBoolean("clickhousePublicAccess") ?? false,
    sentryDsnAppFrontend: config.requireSecret("sentryDsnAppFrontend"),
    sentryDsnAppBackend: config.requireSecret("sentryDsnAppBackend"),
    sentryDsnPipeline: config.requireSecret("sentryDsnPipeline"),
    sentryAuthToken: config.requireSecret("sentryAuthToken"),
    githubToken,
    githubRepo: config.require("githubRepo"),
    alertEmail: config.requireSecret("alertEmail"),
  };
}
