import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import { EnvironmentConfig } from "./config";

/**
 * Weekly disk snapshots for ClickHouse.
 * Only intended for production — staging gets manual one-off snapshots as needed.
 */
export function createBackups(
  cfg: EnvironmentConfig,
  clickhouseVm: gcp.compute.Instance,
  parent?: pulumi.Resource,
) {
  const prefix = cfg.namePrefix;

  // Weekly snapshot every Sunday at 4am UTC — 14-day retention.
  // Pipeline jobs are idempotent so even a week-old snapshot is fine;
  // the pipeline self-heals on next run. 14 days gives us two snapshots
  // of overlap in case one is corrupt.
  const schedule = new gcp.compute.ResourcePolicy(
    `${prefix}-ch-snapshot-schedule`,
    {
      name: `${prefix}-ch-snapshot-schedule`,
      region: gcp.config.region!,
      snapshotSchedulePolicy: {
        schedule: {
          weeklySchedule: {
            dayOfWeeks: [{ day: "SUNDAY", startTime: "04:00" }],
          },
        },
        retentionPolicy: {
          maxRetentionDays: 14,
          onSourceDiskDelete: "KEEP_AUTO_SNAPSHOTS",
        },
        snapshotProperties: {
          storageLocations: gcp.config.region!,
          labels: { environment: cfg.environment, managed: "pulumi" },
        },
      },
    },
    { parent },
  );

  new gcp.compute.DiskResourcePolicyAttachment(
    `${prefix}-ch-snapshot-attach`,
    {
      name: schedule.name,
      disk: clickhouseVm.name,
      zone: gcp.config.zone!,
    },
    { parent },
  );
}
