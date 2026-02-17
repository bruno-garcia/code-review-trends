import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import { EnvironmentConfig } from "./config";

export interface WorkloadIdentityResult {
  pool: gcp.iam.WorkloadIdentityPool;
  provider: gcp.iam.WorkloadIdentityPoolProvider;
}

export function createWorkloadIdentity(
  cfg: EnvironmentConfig,
  deploySa: gcp.serviceaccount.Account,
  parent?: pulumi.Resource,
): WorkloadIdentityResult {
  const prefix = cfg.namePrefix;

  const pool = new gcp.iam.WorkloadIdentityPool(
    `${prefix}-github`,
    {
      workloadIdentityPoolId: `${prefix}-github`,
      displayName: `GitHub Actions (${cfg.environment})`,
    },
    { parent },
  );

  const provider = new gcp.iam.WorkloadIdentityPoolProvider(
    `${prefix}-github`,
    {
      workloadIdentityPoolId: pool.workloadIdentityPoolId,
      workloadIdentityPoolProviderId: `${prefix}-github`,
      oidc: {
        issuerUri: "https://token.actions.githubusercontent.com",
      },
      attributeMapping: {
        "google.subject": "assertion.sub",
        "attribute.repository": "assertion.repository",
        "attribute.ref": "assertion.ref",
      },
      attributeCondition: `assertion.repository == '${cfg.githubRepo}'`,
    },
    { parent },
  );

  // Allow GitHub Actions from this repo to impersonate the deploy SA
  new gcp.serviceaccount.IAMMember(
    `${prefix}-deploy-wif`,
    {
      serviceAccountId: deploySa.name,
      role: "roles/iam.workloadIdentityUser",
      member: pulumi.interpolate`principalSet://iam.googleapis.com/${pool.name}/attribute.repository/${cfg.githubRepo}`,
    },
    { parent },
  );

  return { pool, provider };
}
