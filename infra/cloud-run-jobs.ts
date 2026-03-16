import * as fs from "fs";
import * as path from "path";
import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import { EnvironmentConfig, PLACEHOLDER_IMAGE } from "./config";
import { SecretsResult } from "./secrets";
import { ClickHouseAccess } from "./index";

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
      .catch((err: unknown) => {
        if (err instanceof Error && /not found/i.test(err.message)) {
          return PLACEHOLDER_IMAGE;
        }
        throw err;
      }),
  );
}

const schedulesPath = path.resolve(__dirname, "../pipeline/schedules.json");
const schedules = JSON.parse(fs.readFileSync(schedulesPath, "utf-8")) as Record<
  string,
  { cron: string; description: string; maxRuntime: number }
>;

// Job definitions — args are passed to the pipeline CLI container.
// --env is appended automatically from the Pulumi environment config.
// memory defaults to 512Mi; override per-job when BigQuery result sets are large.
const jobs = [
  { name: "sync", args: ["sync"], timeout: "1800s" },
  { name: "backfill", args: ["backfill"], timeout: "7200s" },
  { name: "discover", args: ["discover"], timeout: "1800s", memory: "1Gi" },
  { name: "enrich", args: ["enrich", "--exit-on-rate-limit"], timeout: "3600s" },
  // Single-task enrichment that sleeps through rate limits instead of exiting.
  // Runs every 3h to ensure lagging stages (e.g., comments) make steady progress
  // even without workers.sh. Uses --total-workers 1 so the single task processes
  // ALL items (not just 1/Nth). Uses --token-index to select the last token in
  // GITHUB_TOKENS — least contested since workers.sh caps active workers to IP
  // pathway count and assigns tokens from index 0 upward.
  { name: "enrich-catchup", args: ["enrich", "--total-workers", "1", "--token-index", "-1", "--cron-slug", "pipeline-enrich-catchup"], timeout: "3600s" },
  { name: "discover-bots", args: ["discover-bots"], timeout: "1800s" },
];

export function createCloudRunJobs(
  cfg: EnvironmentConfig,
  runtimeSa: gcp.serviceaccount.Account,
  secrets: SecretsResult,
  chAccess: ClickHouseAccess,
  parent?: pulumi.Resource,
): void {
  const prefix = cfg.namePrefix;

  const sharedEnvs = [
    { name: "NODE_ENV", value: cfg.environment },
    { name: "CLICKHOUSE_USER", value: "default" },
    { name: "CLICKHOUSE_DB", value: "code_review_trends" },
    {
      name: "CLICKHOUSE_URL",
      value: chAccess.url,
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

  const githubTokensEnv = {
    name: "GITHUB_TOKENS",
    valueSource: {
      secretKeyRef: {
        secret: secrets.githubTokensSecret.secretId,
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
    const needsGithubTokens = job.args[0] === "enrich";
    const extraEnvs = needsGithubTokens ? [githubTokensEnv] : [];
    const image = currentJobImage(jobName);
    // Append --env so every pipeline invocation knows its environment
    const jobArgs = [...job.args, "--env", cfg.environment];

    const crJob = new gcp.cloudrunv2.Job(
      jobName,
      {
        name: jobName,
        location: gcp.config.region!,
        template: {
          // The `enrich` job uses one task per GitHub token for parallelism.
          // This is only effective when workers.sh provides proxy-based IP rotation.
          // Cloud Run Jobs share a single egress IP, so multiple tasks just compete
          // for GitHub's per-IP secondary rate limit. The catchup job handles this
          // by running a single task that sleeps through rate limits.
          taskCount: job.name === "enrich" ? cfg.githubTokenCount : 1,
          parallelism: job.name === "enrich" ? cfg.githubTokenCount : 1,
          template: {
            serviceAccount: runtimeSa.email,
            timeout: job.timeout,
            maxRetries: 1,
            // VPC access for prod: jobs reach ClickHouse via internal IP
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
                image, // CI updates via gcloud; we preserve the current image on pulumi up
                args: jobArgs,
                resources: {
                  limits: { memory: job.memory ?? "512Mi", cpu: "1" },
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
