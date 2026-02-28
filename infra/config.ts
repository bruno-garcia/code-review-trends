import * as pulumi from "@pulumi/pulumi";

const PROJECT_PREFIX = "crt";

/** Default ClickHouse HTTP port — non-standard to reduce drive-by scanning. */
const DEFAULT_CLICKHOUSE_HTTP_PORT = 41923;

/** Caddy HTTPS port — only used when clickhousePublicAccess is true. */
export const CADDY_HTTPS_PORT = 58432;

/** Default subnet CIDR — staging uses 10.100.0.0/24, production 10.101.0.0/24. */
const DEFAULT_SUBNET_CIDR = "10.100.0.0/24";

/** GCP default Cloud Run container — used only on first `pulumi up` before CI deploys. */
export const PLACEHOLDER_IMAGE =
  "us-docker.pkg.dev/cloudrun/container/hello";

export interface EnvironmentConfig {
  environment: string;
  clickhouseMachineType: string;
  clickhouseDiskSizeGb: number;
  /**
   * Domain for Caddy TLS termination. Required when clickhousePublicAccess
   * is true (staging). Undefined when clickhousePublicAccess is false (prod)
   * — ClickHouse is reached via internal IP only.
   */
  clickhouseDomain?: pulumi.Output<string>;
  /** Resource name prefix: crt-{env} */
  namePrefix: string;

  // Networking
  /** Subnet CIDR for the environment VPC. Must not overlap with other VPCs in the project. */
  subnetCidr: string;
  /** ClickHouse HTTP port — different per environment to prevent accidental cross-env connections. */
  clickhouseHttpPort: number;

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
  /** Skip Artifact Registry creation — production reuses staging's shared registry. */
  skipArtifactRegistry: boolean;

  /**
   * Whether ClickHouse is accessible from the public internet.
   *
   * - true (staging): Caddy terminates TLS on a public port. Cloud Run
   *   connects via the external domain + HTTPS.
   * - false (prod): No public ClickHouse port. Cloud Run uses Direct VPC
   *   Egress to reach ClickHouse on its internal IP via plain HTTP.
   */
  clickhousePublicAccess: boolean;

  // VPC peering for external worker VM access
  /**
   * Name of an external VPC to peer with (e.g., for a migration-worker VM).
   * When set, bidirectional VPC peering is created so the worker can reach
   * ClickHouse on its internal IP.
   */
  workerVpcNetwork?: string;
  /**
   * Specific IP of the worker VM to allow through firewall and ClickHouse
   * user config. More restrictive than allowing the entire peered subnet.
   */
  workerIp?: string;

  // Secrets (stored in Pulumi config, created in Secret Manager)
  /** Sentry DSN for the Next.js frontend (public — baked into client bundle) */
  sentryDsnAppFrontend: pulumi.Output<string>;
  /** Sentry DSN for the Next.js backend (private — runtime env var via Secret Manager) */
  sentryDsnAppBackend: pulumi.Output<string>;
  /** Sentry DSN for the pipeline CLI (private — runtime env var via Secret Manager) */
  sentryDsnPipeline: pulumi.Output<string>;
  sentryAuthToken: pulumi.Output<string>;
  /** JSON array of GitHub PATs for parallel enrichment workers */
  githubTokens: pulumi.Output<string>;
  /** Number of tokens in githubTokens (drives Cloud Run Job taskCount) */
  githubTokenCount: pulumi.Output<number>;

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
  const clickhousePublicAccess = config.getBoolean("clickhousePublicAccess") ?? false;

  return {
    environment,
    clickhouseMachineType: config.require("clickhouseMachineType"),
    clickhouseDiskSizeGb: config.requireNumber("clickhouseDiskSizeGb"),
    // Domain is only required for public access (Caddy TLS)
    clickhouseDomain: clickhousePublicAccess
      ? config.requireSecret("clickhouseDomain")
      : config.getSecret("clickhouseDomain") ?? undefined,
    namePrefix: `${PROJECT_PREFIX}-${environment}`,

    // Networking
    subnetCidr: config.get("subnetCidr") ?? DEFAULT_SUBNET_CIDR,
    clickhouseHttpPort: config.getNumber("clickhouseHttpPort") ?? DEFAULT_CLICKHOUSE_HTTP_PORT,

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
    skipArtifactRegistry: config.getBoolean("skipArtifactRegistry") ?? false,
    clickhousePublicAccess,

    // VPC peering
    workerVpcNetwork: config.get("workerVpcNetwork"),
    workerIp: (() => {
      const ip = config.get("workerIp");
      if (ip && ip.includes("/")) {
        throw new Error(
          `workerIp must be a single IP address without CIDR notation, got: ${ip}. ` +
          `The /32 mask is appended automatically in firewall rules.`,
        );
      }
      return ip;
    })(),

    sentryDsnAppFrontend: config.requireSecret("sentryDsnAppFrontend"),
    sentryDsnAppBackend: config.requireSecret("sentryDsnAppBackend"),
    sentryDsnPipeline: config.requireSecret("sentryDsnPipeline"),
    sentryAuthToken: config.requireSecret("sentryAuthToken"),
    ...(() => {
      const parsed = config.requireSecret("githubTokens").apply((tokens) => {
        let arr: unknown;
        try { arr = JSON.parse(tokens); } catch {
          throw new Error("githubTokens must be a valid JSON array of strings.");
        }
        if (!Array.isArray(arr) || arr.length === 0 || arr.some((t) => typeof t !== "string" || !t.trim())) {
          throw new Error("githubTokens must be a non-empty JSON array of non-empty strings.");
        }
        return { raw: tokens, count: (arr as string[]).length };
      });
      return {
        githubTokens: parsed.apply((p) => p.raw),
        githubTokenCount: parsed.apply((p) => p.count),
      };
    })(),
    githubRepo: config.require("githubRepo"),
    alertEmail: config.requireSecret("alertEmail"),
  };
}
