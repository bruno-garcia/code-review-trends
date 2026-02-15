import * as gcp from "@pulumi/gcp";
import * as random from "@pulumi/random";
import * as pulumi from "@pulumi/pulumi";
import { EnvironmentConfig } from "./config";

export interface SecretsResult {
  clickhousePassword: pulumi.Output<string>;
}

export function createSecrets(
  cfg: EnvironmentConfig,
  parent?: pulumi.Resource,
): SecretsResult {
  const prefix = cfg.namePrefix;

  // Generate a random password
  const password = new random.RandomPassword(
    `${prefix}-clickhouse-password`,
    {
      length: 32,
      special: false,
    },
    { parent },
  );

  // Store it in Secret Manager
  const secret = new gcp.secretmanager.Secret(
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
      secret: secret.id,
      secretData: password.result,
    },
    { parent },
  );

  return {
    clickhousePassword: password.result,
  };
}
