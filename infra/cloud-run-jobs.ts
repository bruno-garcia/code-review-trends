import * as fs from "fs";
import * as path from "path";
import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import { CADDY_HTTPS_PORT, EnvironmentConfig } from "./config";
import { SecretsResult } from "./secrets";

const PLACEHOLDER_IMAGE = "us-docker.pkg.dev/cloudrun/container/hello";

/** Read current image from an existing Cloud Run Job, falling back to placeholder. */
function currentJobImage(jobName: string): pulumi.Output<string> {
  return pulumi.output(
    gcp.cloudrunv2
      .getJob({
        name: jobName,
        location: gcp.config.region!,
        project: gcp.config.project!,
      })
      .then(
        (j) =>
          j.templates?.[0]?.templates?.[0]?.containers?.[0]?.image ||
          PLACEHOLDER_IMAGE,
      )
      .catch(() => PLACEHOLDER_IMAGE),
  );
}

const schedulesPath = path.resolve(__dirname, "../pipeline/schedules.json");
const schedules = JSON.parse(fs.readFileSync(schedulesPath, "utf-8")) as Record<
  string,
  { cron: string; description: string; maxRuntime: number }
>;

const jobs = [
  { name: "sync", args: ["sync"], timeout: "1800s" },
  { name: "backfill", args: ["backfill"], timeout: "7200s" },
  { name: "discover", args: ["discover"], timeout: "1800s" },
  { name: "enrich", args: ["enrich", "--exit-on-rate-limit"], timeout: "3600s" },
  { name: "discover-bots", args: ["discover-bots", "--alert"], timeout: "1800s" },
];

export function createCloudRunJobs(
  cfg: EnvironmentConfig,
  runtimeSa: gcp.serviceaccount.Account,
  secrets: SecretsResult,
  parent?: pulumi.Resource,
): void {
  const prefix = cfg.namePrefix;

  const sharedEnvs = [
    { name: "NODE_ENV", value: "production" },
    { name: "CLICKHOUSE_USER", value: "default" },
    { name: "CLICKHOUSE_DB", value: "code_review_trends" },
    {
      name: "CLICKHOUSE_URL",
      value: pulumi.interpolate`https://${cfg.clickhouseDomain}:${CADDY_HTTPS_PORT}`,
    },
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
      name: "SENTRY_DSN_CRT_CLI",
      valueSource: {
        secretKeyRef: {
          secret: secrets.sentryDsnPipelineSecret.secretId,
          version: "latest",
        },
      },
    },
    { name: "GCP_PROJECT_ID", value: gcp.config.project! },
  ];

  const githubTokenEnv = {
    name: "GITHUB_TOKEN",
    valueSource: {
      secretKeyRef: {
        secret: secrets.githubTokenSecret.secretId,
        version: "latest",
      },
    },
  };

  // The runtime SA needs roles/run.invoker to allow Cloud Scheduler to trigger jobs
  new gcp.projects.IAMMember(
    `${prefix}-run-invoker`,
    {
      project: gcp.config.project!,
      role: "roles/run.invoker",
      member: runtimeSa.email.apply((e) => `serviceAccount:${e}`),
    },
    { parent },
  );

  for (const job of jobs) {
    const jobName = `${prefix}-${job.name}`;
    const extraEnvs = job.name === "enrich" ? [githubTokenEnv] : [];
    const image = currentJobImage(jobName);

    const crJob = new gcp.cloudrunv2.Job(
      jobName,
      {
        name: jobName,
        location: gcp.config.region!,
        template: {
          taskCount: 1,
          template: {
            serviceAccount: runtimeSa.email,
            timeout: job.timeout,
            maxRetries: 1,
            containers: [
              {
                image, // CI updates via gcloud; we preserve the current image on pulumi up
                args: job.args,
                resources: {
                  limits: { memory: "512Mi", cpu: "1" },
                },
                envs: [...sharedEnvs, ...extraEnvs],
              },
            ],
          },
        },
      },
      { parent },
    );

    const schedule = schedules[job.name];
    if (!schedule) {
      throw new Error(`Missing schedule for job '${job.name}' in schedules.json`);
    }

    new gcp.cloudscheduler.Job(
      `${jobName}-trigger`,
      {
        name: `${jobName}-trigger`,
        region: gcp.config.region!,
        schedule: schedule.cron,
        timeZone: "UTC",
        httpTarget: {
          uri: pulumi.interpolate`https://${gcp.config.region!}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${gcp.config.project}/jobs/${jobName}:run`,
          httpMethod: "POST",
          oauthToken: {
            serviceAccountEmail: runtimeSa.email,
          },
        },
      },
      { parent, dependsOn: [crJob] },
    );
  }
}
