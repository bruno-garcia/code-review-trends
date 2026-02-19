import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import { EnvironmentConfig } from "./config";

/**
 * Disk usage alerting for the ClickHouse VM.
 *
 * How it works:
 * 1. A cron job on the VM checks disk usage every 15 minutes.
 * 2. If usage exceeds 80%, it writes a structured log entry to syslog via
 *    the `logger` command, which GCE forwards to Cloud Logging.
 * 3. A log-based metric counts these entries.
 * 4. An alert policy fires when the metric is > 0 and emails the operator.
 *
 * No Ops Agent required — uses the VM's syslog → Cloud Logging path.
 */
export function createDiskMonitoring(
  cfg: EnvironmentConfig,
  alertEmail: pulumi.Input<string>,
  parent?: pulumi.Resource,
) {
  const prefix = cfg.namePrefix;

  // Email notification channel
  const emailChannel = new gcp.monitoring.NotificationChannel(
    `${prefix}-email-alert`,
    {
      displayName: `${prefix} alerts`,
      type: "email",
      labels: { email_address: alertEmail },
    },
    { parent },
  );

  // Log-based metric: counts "DISK_HIGH" entries from the ClickHouse VM.
  // The VM cron writes to syslog which GCE streams to Cloud Logging.
  const diskMetric = new gcp.logging.Metric(
    `${prefix}-disk-high`,
    {
      name: `${prefix}-disk-high`,
      filter: `resource.type="gce_instance" AND textPayload=~"DISK_HIGH.*${prefix}-clickhouse" AND resource.labels.zone="${gcp.config.zone!}"`,
      description: "ClickHouse VM disk usage exceeded 80%",
      metricDescriptor: {
        metricKind: "DELTA",
        valueType: "INT64",
      },
    },
    { parent },
  );

  // Alert when the metric fires (any count > 0 in a 15-min window)
  new gcp.monitoring.AlertPolicy(
    `${prefix}-disk-alert`,
    {
      displayName: `${prefix}: ClickHouse disk usage > 80%`,
      combiner: "OR",
      conditions: [
        {
          displayName: "Disk usage critical",
          conditionThreshold: {
            filter: pulumi.interpolate`metric.type="logging.googleapis.com/user/${diskMetric.name}"`,
            comparison: "COMPARISON_GT",
            thresholdValue: 0,
            duration: "0s",
            aggregations: [
              {
                alignmentPeriod: "900s", // 15 minutes (matches cron interval)
                perSeriesAligner: "ALIGN_SUM",
              },
            ],
          },
        },
      ],
      notificationChannels: [emailChannel.name],
      alertStrategy: {
        autoClose: "86400s", // auto-resolve after 24h if no new alerts
      },
      documentation: {
        content: pulumi.interpolate`ClickHouse disk usage on ${prefix}-clickhouse exceeded 80%. SSH in and check: \`df -h /\`. Consider resizing the disk or cleaning old data.`,
        mimeType: "text/markdown",
      },
    },
    { parent },
  );
}

/**
 * Returns the startup script snippet for the disk usage cron.
 * Append this to the ClickHouse VM startup script.
 */
export const DISK_CHECK_STARTUP_SNIPPET = `
# ---- Disk usage watchdog ----
# Checks disk usage every 15 minutes. Logs to syslog which GCE
# forwards to Cloud Logging. A log-based alert emails the operator.

cat > /usr/local/bin/disk-check.sh <<'DISKEOF'
#!/bin/bash
USAGE=$(df / --output=pcent | tail -1 | tr -d ' %')
if [ "$USAGE" -gt 80 ]; then
  logger -p user.crit "DISK_HIGH: Root disk at \${USAGE}% on $(hostname)"
fi
DISKEOF
chmod +x /usr/local/bin/disk-check.sh

echo "*/15 * * * * root /usr/local/bin/disk-check.sh" > /etc/cron.d/disk-check
chmod 644 /etc/cron.d/disk-check
`;
