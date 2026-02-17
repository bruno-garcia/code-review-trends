import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import { EnvironmentConfig } from "./config";

export interface ServiceAccountsResult {
  runtimeSa: gcp.serviceaccount.Account;
  deploySa: gcp.serviceaccount.Account;
}

export function createServiceAccounts(
  cfg: EnvironmentConfig,
  parent?: pulumi.Resource,
): ServiceAccountsResult {
  const prefix = cfg.namePrefix;

  // Runtime SA — used by Cloud Run service and jobs at runtime
  const runtimeSa = new gcp.serviceaccount.Account(
    `${prefix}-run`,
    {
      accountId: `${prefix}-run`,
      displayName: `${prefix} Cloud Run runtime`,
    },
    { parent },
  );

  const runtimeRoles = [
    "roles/secretmanager.secretAccessor",
    "roles/bigquery.jobUser",
    "roles/bigquery.dataViewer",
  ];

  for (const role of runtimeRoles) {
    const shortRole = role.split("/")[1];
    new gcp.projects.IAMMember(
      `${prefix}-run-${shortRole}`,
      {
        role,
        member: pulumi.interpolate`serviceAccount:${runtimeSa.email}`,
      },
      { parent },
    );
  }

  // Deploy SA — used by GitHub Actions via WIF to deploy
  const deploySa = new gcp.serviceaccount.Account(
    `${prefix}-deploy`,
    {
      accountId: `${prefix}-deploy`,
      displayName: `${prefix} CI deploy`,
    },
    { parent },
  );

  const deployRoles = [
    "roles/run.admin",
    "roles/artifactregistry.writer",
  ];

  for (const role of deployRoles) {
    const shortRole = role.split("/")[1];
    new gcp.projects.IAMMember(
      `${prefix}-deploy-${shortRole}`,
      {
        role,
        member: pulumi.interpolate`serviceAccount:${deploySa.email}`,
      },
      { parent },
    );
  }

  // Deploy SA needs to act as the runtime SA when deploying Cloud Run services
  new gcp.serviceaccount.IAMMember(
    `${prefix}-deploy-acts-as-run`,
    {
      serviceAccountId: runtimeSa.name,
      role: "roles/iam.serviceAccountUser",
      member: pulumi.interpolate`serviceAccount:${deploySa.email}`,
    },
    { parent },
  );

  return { runtimeSa, deploySa };
}
