import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import { CADDY_HTTPS_PORT, EnvironmentConfig, PLACEHOLDER_IMAGE } from "./config";
import { SecretsResult } from "./secrets";

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
          minInstanceCount: 1,
          maxInstanceCount: 2,
        },
        containers: [
          {
            // CI manages the actual image via `gcloud run deploy --image=...`.
            // On `pulumi up` we re-use whatever image is currently running
            // to avoid reverting CI deploys. See currentAppImage() above.
            image,
            ports: { containerPort: 8080 },
            resources: {
              limits: { memory: "2Gi", cpu: "1" },
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
