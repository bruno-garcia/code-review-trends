import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import { EnvironmentConfig, PLACEHOLDER_IMAGE } from "./config";
import { SecretsResult } from "./secrets";
import { ClickHouseAccess } from "./index";

export interface CloudRunAppResult {
  service: gcp.cloudrunv2.Service;
  serviceUrl: pulumi.Output<string>;
}

/**
 * Read the currently-deployed container image from Cloud Run so that
 * `pulumi up` preserves whatever CI deployed rather than reverting to
 * the placeholder.  On the very first run (service doesn't exist yet)
 * we fall back to the placeholder — CI will deploy the real image
 * immediately after.
 *
 * Only catches "not found" errors (first deploy). Any other failure
 * (permissions, transient API errors) is rethrown so `pulumi up` fails
 * loudly instead of silently reverting to the placeholder.
 */
function currentAppImage(serviceName: string): pulumi.Output<string> {
  return pulumi.output(
    gcp.cloudrunv2
      .getService({
        name: serviceName,
        location: gcp.config.region!,
        project: gcp.config.project!,
      })
      .then((s) => s.templates?.[0]?.containers?.[0]?.image || PLACEHOLDER_IMAGE)
      .catch((err: unknown) => {
        if (err instanceof Error && /not found/i.test(err.message)) {
          return PLACEHOLDER_IMAGE;
        }
        throw err;
      }),
  );
}

export function createCloudRunApp(
  cfg: EnvironmentConfig,
  runtimeSa: gcp.serviceaccount.Account,
  secrets: SecretsResult,
  chAccess: ClickHouseAccess,
  parent?: pulumi.Resource,
): CloudRunAppResult {
  const prefix = cfg.namePrefix;
  const appServiceName = `${prefix}-app`;
  const image = currentAppImage(appServiceName);

  const service = new gcp.cloudrunv2.Service(
    `${prefix}-app`,
    {
      name: appServiceName,
      location: gcp.config.region!,
      ingress: "INGRESS_TRAFFIC_ALL",
      template: {
        serviceAccount: runtimeSa.email,
        scaling: {
          minInstanceCount: cfg.appMinInstances,
          maxInstanceCount: cfg.appMaxInstances,
        },
        // Limit concurrent requests per instance to reduce ClickHouse query
        // pressure. Default Cloud Run concurrency (80) causes too many
        // simultaneous heavy queries under traffic spikes.
        maxInstanceRequestConcurrency: cfg.appConcurrency,

        // VPC access for prod: Cloud Run uses Direct VPC Egress to reach
        // ClickHouse on its internal IP. Only private-range traffic (10.x)
        // routes through the VPC; public traffic (Sentry, etc.) goes direct.
        ...(chAccess.vpcAccess
          ? {
              vpcAccess: {
                networkInterfaces: [
                  {
                    network: chAccess.vpcAccess.network,
                    subnetwork: chAccess.vpcAccess.subnetwork,
                  },
                ],
                egress: "PRIVATE_RANGES_ONLY",
              },
            }
          : {}),

        containers: [
          {
            // CI manages the actual image via `gcloud run deploy --image=...`.
            // On `pulumi up` we re-use whatever image is currently running
            // to avoid reverting CI deploys. See currentAppImage() above.
            image,
            ports: { containerPort: 8080 },
            resources: {
              limits: { memory: cfg.appMemory, cpu: cfg.appCpu },
            },
            envs: [
              // Plain env vars
              { name: "NODE_ENV", value: "production" },
              { name: "CLICKHOUSE_USER", value: "default" },
              { name: "CLICKHOUSE_DB", value: "code_review_trends" },
              {
                name: "CLICKHOUSE_URL",
                value: chAccess.url,
              },
              // Frontend Sentry DSN — public, visible in the client bundle.
              // Stored in Secret Manager for consistency but not truly secret.
              {
                name: "NEXT_PUBLIC_SENTRY_DSN",
                valueSource: {
                  secretKeyRef: {
                    secret: secrets.sentryDsnAppFrontendSecret.secretId,
                    version: "latest",
                  },
                },
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
              // Backend Sentry DSN — private, server-side only.
              {
                name: "SENTRY_DSN",
                valueSource: {
                  secretKeyRef: {
                    secret: secrets.sentryDsnAppBackendSecret.secretId,
                    version: "latest",
                  },
                },
              },
            ],
          },
        ],
      },
    },
    { parent },
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
