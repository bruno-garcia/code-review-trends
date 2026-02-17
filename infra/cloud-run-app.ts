import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import { CADDY_HTTPS_PORT, EnvironmentConfig } from "./config";
import { SecretsResult } from "./secrets";

export interface CloudRunAppResult {
  service: gcp.cloudrunv2.Service;
  serviceUrl: pulumi.Output<string>;
}

export function createCloudRunApp(
  cfg: EnvironmentConfig,
  runtimeSa: gcp.serviceaccount.Account,
  secrets: SecretsResult,
  parent?: pulumi.Resource,
): CloudRunAppResult {
  const prefix = cfg.namePrefix;

  const service = new gcp.cloudrunv2.Service(
    `${prefix}-app`,
    {
      name: `${prefix}-app`,
      location: gcp.config.region!,
      ingress: "INGRESS_TRAFFIC_ALL",
      template: {
        serviceAccount: runtimeSa.email,
        scaling: {
          minInstanceCount: 0,
          maxInstanceCount: 2,
        },
        containers: [
          {
            // Placeholder image — CI manages the actual image via `gcloud run deploy --image=...`
            image: "us-docker.pkg.dev/cloudrun/container/hello",
            ports: { containerPort: 8080 },
            resources: {
              limits: { memory: "2Gi", cpu: "4" },
            },
            envs: [
              // Plain env vars
              { name: "NODE_ENV", value: "production" },
              { name: "CLICKHOUSE_USER", value: "default" },
              { name: "CLICKHOUSE_DB", value: "code_review_trends" },
              // Constructed from config — Pulumi resolves the secret domain at apply time.
              // Cloud Run stores this as a plain env var, which is acceptable since
              // Cloud Run env vars are encrypted at rest and the domain alone isn't a credential.
              {
                name: "CLICKHOUSE_URL",
                value: pulumi.interpolate`https://${cfg.clickhouseDomain}:${CADDY_HTTPS_PORT}`,
              },
              // Secret-sourced env vars
              {
                name: "CLICKHOUSE_PASSWORD",
                valueSource: {
                  secretKeyRef: {
                    secret: secrets.clickhousePasswordSecret.secretId,
                    version: "latest",
                  },
                },
              },
              {
                name: "SENTRY_DSN",
                valueSource: {
                  secretKeyRef: {
                    secret: secrets.sentryDsnAppSecret.secretId,
                    version: "latest",
                  },
                },
              },
            ],
          },
        ],
      },
    },
    {
      parent,
      // CI updates the image on each deploy — don't let Pulumi revert it
      ignoreChanges: ["template.containers[0].image"],
    },
  );

  // Allow unauthenticated access (public website)
  new gcp.cloudrunv2.ServiceIamMember(
    `${prefix}-app-public`,
    {
      name: service.name,
      location: service.location,
      role: "roles/run.invoker",
      member: "allUsers",
    },
    { parent },
  );

  // Domain mapping (v1 API — v2 doesn't support domain mapping yet).
  // Requires the domain to be verified in Google Search Console.
  // After applying, set up DNS CNAME records as shown in the Google Cloud Console.
  new gcp.cloudrun.DomainMapping(
    `${prefix}-app-domain`,
    {
      name: cfg.appDomain,
      location: gcp.config.region!,
      metadata: {
        namespace: gcp.config.project!,
      },
      spec: {
        routeName: service.name,
      },
    },
    { parent },
  );

  return {
    service,
    serviceUrl: service.uri,
  };
}
