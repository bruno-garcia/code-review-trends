import * as gcp from "@pulumi/gcp";
import * as random from "@pulumi/random";
import * as pulumi from "@pulumi/pulumi";
import { EnvironmentConfig } from "./config";

export interface SecretsResult {
  clickhousePassword: pulumi.Output<string>;
  // Secret resource references (for Cloud Run env var bindings)
  clickhousePasswordSecret: gcp.secretmanager.Secret;
  sentryDsnAppSecret: gcp.secretmanager.Secret;
  sentryDsnPipelineSecret: gcp.secretmanager.Secret;
  sentryAuthTokenSecret: gcp.secretmanager.Secret;
  githubTokenSecret: gcp.secretmanager.Secret;
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
  const sentryDsnAppSecret = createManagedSecret(
    `${prefix}-sentry-dsn-app`,
    `${prefix}-sentry-dsn-app`,
    cfg.sentryDsnApp,
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

  const githubTokenSecret = createManagedSecret(
    `${prefix}-github-token`,
    `${prefix}-github-token`,
    cfg.githubToken,
    parent,
  );

  return {
    clickhousePassword: password.result,
    clickhousePasswordSecret,
    sentryDsnAppSecret,
    sentryDsnPipelineSecret,
    sentryAuthTokenSecret,
    githubTokenSecret,
  };
}
