import * as gcp from "@pulumi/gcp";
import * as random from "@pulumi/random";
import * as pulumi from "@pulumi/pulumi";
import { EnvironmentConfig } from "./config";

export interface SecretsResult {
  clickhousePassword: pulumi.Output<string>;
  // Secret resource references (for Cloud Run env var bindings)
  clickhousePasswordSecret: gcp.secretmanager.Secret;
  /** Frontend Sentry DSN — public, baked into client bundle at build time */
  sentryDsnAppFrontendSecret: gcp.secretmanager.Secret;
  /** Backend Sentry DSN — private, injected at runtime via Secret Manager */
  sentryDsnAppBackendSecret: gcp.secretmanager.Secret;
  /** Pipeline Sentry DSN — private, injected at runtime via Secret Manager */
  sentryDsnPipelineSecret: gcp.secretmanager.Secret;
  sentryAuthTokenSecret: gcp.secretmanager.Secret;
  /** JSON array of GitHub PATs — used by parallel enrichment workers and workers.sh */
  githubTokensSecret: gcp.secretmanager.Secret;
}

/**
 * Create a Secret Manager secret with an initial version.
 * Used for secrets whose values come from Pulumi config (not auto-generated).
 */
function createManagedSecret(
  name: string,
  secretId: string,
  value: pulumi.Output<string>,
  parent?: pulumi.Resource,
): gcp.secretmanager.Secret {
  const secret = new gcp.secretmanager.Secret(
    name,
    {
      secretId,
      replication: { auto: {} },
    },
    { parent },
  );

  new gcp.secretmanager.SecretVersion(
    `${name}-version`,
    {
      secret: secret.id,
      secretData: value,
    },
    { parent },
  );

  return secret;
}

/**
 * Create a Secret Manager secret with an initial version (exported for use in index.ts).
 */
export { createManagedSecret };

export function createSecrets(
  cfg: EnvironmentConfig,
  parent?: pulumi.Resource,
): SecretsResult {
  const prefix = cfg.namePrefix;

  // Generate a random ClickHouse password
  const password = new random.RandomPassword(
    `${prefix}-clickhouse-password`,
    {
      length: 32,
      special: false,
    },
    { parent },
  );

  // Store it in Secret Manager
  const clickhousePasswordSecret = new gcp.secretmanager.Secret(
    `${prefix}-clickhouse-password`,
    {
      secretId: `${prefix}-clickhouse-password`,
      replication: {
        auto: {},
      },
    },
    { parent },
  );

  new gcp.secretmanager.SecretVersion(
    `${prefix}-clickhouse-password-version`,
    {
      secret: clickhousePasswordSecret.id,
      secretData: password.result,
    },
    { parent },
  );

  // Config-sourced secrets (values from `pulumi config set --secret`)
  const sentryDsnAppFrontendSecret = createManagedSecret(
    `${prefix}-sentry-dsn-app-fe`,
    `${prefix}-sentry-dsn-app-fe`,
    cfg.sentryDsnAppFrontend,
    parent,
  );

  const sentryDsnAppBackendSecret = createManagedSecret(
    `${prefix}-sentry-dsn-app-be`,
    `${prefix}-sentry-dsn-app-be`,
    cfg.sentryDsnAppBackend,
    parent,
  );

  const sentryDsnPipelineSecret = createManagedSecret(
    `${prefix}-sentry-dsn-pipeline`,
    `${prefix}-sentry-dsn-pipeline`,
    cfg.sentryDsnPipeline,
    parent,
  );

  const sentryAuthTokenSecret = createManagedSecret(
    `${prefix}-sentry-auth-token`,
    `${prefix}-sentry-auth-token`,
    cfg.sentryAuthToken,
    parent,
  );

  const githubTokensSecret = createManagedSecret(
    `${prefix}-github-tokens`, // Pulumi resource name
    `${prefix}-github-tokens`, // GCP Secret Manager secretId
    cfg.githubTokens,
    parent,
  );

  return {
    clickhousePassword: password.result,
    clickhousePasswordSecret,
    sentryDsnAppFrontendSecret,
    sentryDsnAppBackendSecret,
    sentryDsnPipelineSecret,
    sentryAuthTokenSecret,
    githubTokensSecret,
  };
}
