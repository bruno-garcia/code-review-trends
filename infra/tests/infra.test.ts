import { describe, it, expect, beforeEach } from "vitest";
import * as pulumi from "@pulumi/pulumi";
import * as fs from "fs";
import * as path from "path";

// Setup mocks before importing infra modules
import "./setup";
import { setTestConfig, resetTestConfig } from "./setup";

// Helper to resolve Pulumi outputs in tests
function outputValue<T>(output: pulumi.Output<T>): Promise<T> {
  return new Promise((resolve) => output.apply(resolve));
}

// ============================================================
// Staging-like config (default — clickhousePublicAccess: true)
// ============================================================

describe("config", () => {
  beforeEach(() => resetTestConfig());

  it("loads environment config with correct prefix", async () => {
    const { loadConfig } = await import("../config");
    const cfg = loadConfig();

    expect(cfg.environment).toBe("test");
    expect(cfg.namePrefix).toBe("crt-test");
    expect(cfg.clickhouseMachineType).toBe("e2-medium");
    expect(cfg.clickhouseDiskSizeGb).toBe(20);

    const domain = await outputValue(cfg.clickhouseDomain!);
    expect(domain).toBe("ch-test.example.com");
  });

  it("exports CADDY_HTTPS_PORT as non-standard constant", async () => {
    const { CADDY_HTTPS_PORT } = await import("../config");
    expect(CADDY_HTTPS_PORT).toBeGreaterThan(1024);
    expect(CADDY_HTTPS_PORT).not.toBe(443);
  });

  it("uses default subnet CIDR and CH port when not overridden", async () => {
    const { loadConfig } = await import("../config");
    const cfg = loadConfig();
    expect(cfg.subnetCidr).toBe("10.100.0.0/24");
    expect(cfg.clickhouseHttpPort).toBe(41923);
    expect(cfg.clickhouseHttpPort).not.toBe(8123); // non-standard
    expect(cfg.clickhouseHttpPort).toBeGreaterThan(1024);
  });

  it("uses configured subnet CIDR and CH port when overridden", async () => {
    setTestConfig({
      subnetCidr: "10.101.0.0/24",
      clickhouseHttpPort: "39847",
    });
    // Need fresh import since config is read at import time
    const { loadConfig } = await import("../config");
    const cfg = loadConfig();
    expect(cfg.subnetCidr).toBe("10.101.0.0/24");
    expect(cfg.clickhouseHttpPort).toBe(39847);
  });

  it("clickhouseDomain is optional when clickhousePublicAccess is false", async () => {
    setTestConfig({
      clickhousePublicAccess: "false",
      clickhouseDomain: undefined as unknown as string,
    });
    const { loadConfig } = await import("../config");
    const cfg = loadConfig();
    expect(cfg.clickhouseDomain).toBeUndefined();
  });

  it("clickhouseDomain is required when clickhousePublicAccess is true", async () => {
    // Default config has clickhousePublicAccess: true and clickhouseDomain set
    const { loadConfig } = await import("../config");
    const cfg = loadConfig();
    expect(cfg.clickhouseDomain).toBeDefined();
    const domain = await outputValue(cfg.clickhouseDomain!);
    expect(domain).toBe("ch-test.example.com");
  });

  it("defaults for skipArtifactRegistry and worker fields", async () => {
    const { loadConfig } = await import("../config");
    const cfg = loadConfig();
    expect(cfg.skipArtifactRegistry).toBe(false);
    expect(cfg.workerVpcNetwork).toBeUndefined();
    expect(cfg.workerIp).toBeUndefined();
  });

  it("loads worker config when set", async () => {
    setTestConfig({
      workerVpcNetwork: "external-vpc",
      workerIp: "10.0.0.100",
      skipArtifactRegistry: "true",
    });
    const { loadConfig } = await import("../config");
    const cfg = loadConfig();
    expect(cfg.workerVpcNetwork).toBe("external-vpc");
    expect(cfg.workerIp).toBe("10.0.0.100");
    expect(cfg.skipArtifactRegistry).toBe(true);
  });

  it("rejects workerIp with CIDR notation", async () => {
    setTestConfig({ workerIp: "10.0.0.0/24" });
    const { loadConfig } = await import("../config");
    expect(() => loadConfig()).toThrow("workerIp must be a single IP address without CIDR notation");
  });
});

describe("network", () => {
  beforeEach(() => resetTestConfig());

  it("creates VPC, subnet, and static IP", async () => {
    const { loadConfig } = await import("../config");
    const { createNetwork } = await import("../network");
    const cfg = loadConfig();
    const network = createNetwork(cfg);

    const vpcName = await outputValue(network.vpc.name);
    expect(vpcName).toBe("crt-test-vpc");

    const subnetName = await outputValue(network.subnet.name);
    expect(subnetName).toBe("crt-test-subnet");

    const ipName = await outputValue(network.clickhouseExternalIp.name);
    expect(ipName).toBe("crt-test-clickhouse-ip");

    // Static IP should be external
    const addressType = await outputValue(
      network.clickhouseExternalIp.addressType,
    );
    expect(addressType).toBe("EXTERNAL");
  });

  it("uses configurable subnet CIDR", async () => {
    const { loadConfig } = await import("../config");
    const { createNetwork } = await import("../network");
    const cfg = loadConfig();
    const network = createNetwork(cfg);

    const cidr = await outputValue(network.subnet.ipCidrRange);
    expect(cidr).toBe("10.100.0.0/24");
  });

  it("uses custom subnet CIDR when configured", async () => {
    setTestConfig({ subnetCidr: "10.101.0.0/24" });
    const { loadConfig } = await import("../config");
    const { createNetwork } = await import("../network");
    const cfg = loadConfig();
    const network = createNetwork(cfg);

    const cidr = await outputValue(network.subnet.ipCidrRange);
    expect(cidr).toBe("10.101.0.0/24");
  });
});

describe("firewall", () => {
  beforeEach(() => resetTestConfig());

  it("creates firewall rules without throwing", async () => {
    const { loadConfig } = await import("../config");
    const { createFirewallRules } = await import("../firewall");
    const cfg = loadConfig();
    expect(() => createFirewallRules(cfg, pulumi.output("test-vpc"))).not.toThrow();
  });

  it("does not create worker firewall rule when workerIp is not set", async () => {
    const { loadConfig } = await import("../config");
    const { createFirewallRules } = await import("../firewall");
    const cfg = loadConfig();
    expect(cfg.workerIp).toBeUndefined();
    // Should not throw — no worker rule created
    createFirewallRules(cfg, pulumi.output("test-vpc"));
  });

  it("creates worker firewall rule when workerIp is set", async () => {
    setTestConfig({ workerIp: "10.0.0.100" });
    const { loadConfig } = await import("../config");
    const { createFirewallRules } = await import("../firewall");
    const cfg = loadConfig();
    // Should not throw — worker rule is created
    expect(() => createFirewallRules(cfg, pulumi.output("test-vpc"))).not.toThrow();
  });
});

describe("secrets", () => {
  beforeEach(() => resetTestConfig());

  it("generates a password of sufficient length", async () => {
    const { loadConfig } = await import("../config");
    const { createSecrets } = await import("../secrets");
    const cfg = loadConfig();
    const secrets = createSecrets(cfg);

    const password = await outputValue(secrets.clickhousePassword);
    expect(password.length).toBeGreaterThanOrEqual(32);
  });

  it("creates all expected Secret Manager secrets", async () => {
    const { loadConfig } = await import("../config");
    const { createSecrets } = await import("../secrets");
    const cfg = loadConfig();
    const secrets = createSecrets(cfg);

    expect(secrets.clickhousePasswordSecret).toBeDefined();
    expect(secrets.sentryDsnAppFrontendSecret).toBeDefined();
    expect(secrets.sentryDsnAppBackendSecret).toBeDefined();
    expect(secrets.sentryDsnPipelineSecret).toBeDefined();
    expect(secrets.sentryAuthTokenSecret).toBeDefined();
    expect(secrets.githubTokensSecret).toBeDefined();
  });

  it("exports createManagedSecret for clickhouse-url secret", async () => {
    const { createManagedSecret } = await import("../secrets");
    expect(createManagedSecret).toBeTypeOf("function");
    // Test that it creates a secret without throwing
    const secret = createManagedSecret(
      "test-url",
      "test-url",
      pulumi.output("http://10.0.0.1:8123"),
    );
    expect(secret).toBeDefined();
  });
});

describe("clickhouse VM", () => {
  beforeEach(() => resetTestConfig());

  it("creates VM with correct name and machine type", async () => {
    const { loadConfig } = await import("../config");
    const { createClickHouseVM } = await import("../clickhouse");
    const cfg = loadConfig();

    const result = createClickHouseVM(
      cfg,
      pulumi.output("test-vpc"),
      pulumi.output("test-subnet"),
      pulumi.output("1.2.3.4"),
      pulumi.output("test-password"),
    );

    const vmName = await outputValue(result.vm.name);
    expect(vmName).toBe("crt-test-clickhouse");

    const machineType = await outputValue(result.vm.machineType);
    expect(machineType).toBe("e2-medium");
  });

  it("has boot disk with autoDelete disabled", async () => {
    const { loadConfig } = await import("../config");
    const { createClickHouseVM } = await import("../clickhouse");
    const cfg = loadConfig();

    const result = createClickHouseVM(
      cfg,
      pulumi.output("test-vpc"),
      pulumi.output("test-subnet"),
      pulumi.output("1.2.3.4"),
      pulumi.output("test-password"),
    );

    const bootDisk = await outputValue(result.vm.bootDisk);
    expect(bootDisk.autoDelete).toBe(false);
  });

  it("tags VM with clickhouse for firewall targeting", async () => {
    const { loadConfig } = await import("../config");
    const { createClickHouseVM } = await import("../clickhouse");
    const cfg = loadConfig();

    const result = createClickHouseVM(
      cfg,
      pulumi.output("test-vpc"),
      pulumi.output("test-subnet"),
      pulumi.output("1.2.3.4"),
      pulumi.output("test-password"),
    );

    const tags = await outputValue(result.vm.tags);
    expect(tags).toContain("clickhouse");
  });

  it("startup script with Caddy (public access)", async () => {
    const { loadConfig } = await import("../config");
    const { createClickHouseVM } = await import("../clickhouse");
    const { CADDY_HTTPS_PORT } = await import("../config");
    const cfg = loadConfig();

    const result = createClickHouseVM(
      cfg,
      pulumi.output("test-vpc"),
      pulumi.output("test-subnet"),
      pulumi.output("1.2.3.4"),
      pulumi.output("test-password-123"),
    );

    const script = await outputValue(result.vm.metadataStartupScript);
    expect(typeof script).toBe("string");
    const s = script as string;

    // ClickHouse installation
    expect(s).toContain("clickhouse-server");
    expect(s).toContain("clickhouse-client");
    expect(s).toContain("First boot");
    expect(s).toContain("Packages already installed");

    // GPG keys imported in batch mode
    expect(s).toContain("gpg --batch --yes --dearmor");

    // ClickHouse listens on all interfaces, uses configured port
    expect(s).toContain("<listen_host>0.0.0.0</listen_host>");
    expect(s).toContain(`<http_port>${cfg.clickhouseHttpPort}</http_port>`);

    // Memory limits
    expect(s).toContain(
      "<max_server_memory_usage_to_ram_ratio>0.9</max_server_memory_usage_to_ram_ratio>",
    );
    expect(s).toContain("<max_memory_usage>4000000000</max_memory_usage>");
    expect(s).toContain("<max_execution_time>60</max_execution_time>");
    expect(s).toContain("<join_algorithm>direct,parallel_hash,hash,grace_hash</join_algorithm>");

    // Password injection
    expect(s).toContain("test-password-123");
    expect(s).not.toContain("CHANGE_ME");
    expect(s).toContain("password_sha256_hex");
    expect(s).toContain("sha256sum");

    // Removes empty <password> from users.xml to avoid conflict with password_sha256_hex
    expect(s).toMatch(/sed -i .*<password>.*password>.*\/etc\/clickhouse-server\/users\.xml/);

    // Network ACL includes subnet CIDR only (no worker IP in default config)
    expect(s).toContain("<ip>10.100.0.0/24</ip>");

    // Readiness check
    expect(s).toContain("ClickHouse did not become ready");

    // Caddy is present (public access)
    expect(s).toContain("ch-test.example.com");
    expect(s).toContain(String(CADDY_HTTPS_PORT));
    expect(s).toContain("reverse_proxy 127.0.0.1:");
    expect(s).not.toContain("reverse_proxy localhost:");

    // Health-check watchdog
    expect(s).toContain("caddy-watchdog");
    expect(s).toContain("systemctl restart caddy");
    expect(s).toContain("http://127.0.0.1:80/");
    expect(s).toContain("systemctl is-active --quiet caddy");

    // Caddy install check
    expect(s).toContain("! command -v caddy");

    // Database creation
    expect(s).toContain("CREATE DATABASE IF NOT EXISTS code_review_trends");

    // System log TTL (tiered: 30d diagnostics, 10d merge/views, 3d high-volume)
    expect(s).toContain("log-ttl.xml");
    expect(s).toContain("<ttl>event_date + INTERVAL 30 DAY</ttl>");
    expect(s).toContain("<ttl>event_date + INTERVAL 10 DAY</ttl>");
    expect(s).toContain("<ttl>event_date + INTERVAL 3 DAY</ttl>");

    // Disk usage watchdog
    expect(s).toContain("disk-check.sh");
    expect(s).toContain("DISK_HIGH");
  });

  it("startup script without Caddy (private access)", async () => {
    setTestConfig({
      clickhousePublicAccess: "false",
      clickhouseDomain: undefined as unknown as string,
      clickhouseHttpPort: "39847",
      subnetCidr: "10.101.0.0/24",
    });
    const { loadConfig } = await import("../config");
    const { createClickHouseVM } = await import("../clickhouse");
    const cfg = loadConfig();

    const result = createClickHouseVM(
      cfg,
      pulumi.output("test-vpc"),
      pulumi.output("test-subnet"),
      pulumi.output("1.2.3.4"),
      pulumi.output("test-password-456"),
    );

    const script = await outputValue(result.vm.metadataStartupScript);
    const s = script as string;

    // ClickHouse is installed
    expect(s).toContain("clickhouse-server");
    expect(s).toContain("clickhouse-client");

    // Uses configured port
    expect(s).toContain("<http_port>39847</http_port>");

    // Uses configured subnet
    expect(s).toContain("<ip>10.101.0.0/24</ip>");

    // No Caddy
    expect(s).not.toContain("Caddyfile");
    expect(s).not.toContain("caddy-watchdog");
    expect(s).not.toContain("reverse_proxy");
    expect(s).toContain("clickhousePublicAccess is false");

    // Caddy not in the install check or package list
    expect(s).not.toContain("! command -v caddy");

    // Database still created
    expect(s).toContain("CREATE DATABASE IF NOT EXISTS code_review_trends");

    // System log TTL (present regardless of Caddy)
    expect(s).toContain("log-ttl.xml");
    expect(s).toContain("<ttl>event_date + INTERVAL 30 DAY</ttl>");
    expect(s).toContain("<ttl>event_date + INTERVAL 10 DAY</ttl>");
    expect(s).toContain("<ttl>event_date + INTERVAL 3 DAY</ttl>");
  });

  it("startup script includes worker IP in networks when set", async () => {
    setTestConfig({ workerIp: "10.0.0.100" });
    const { loadConfig } = await import("../config");
    const { createClickHouseVM } = await import("../clickhouse");
    const cfg = loadConfig();

    const result = createClickHouseVM(
      cfg,
      pulumi.output("test-vpc"),
      pulumi.output("test-subnet"),
      pulumi.output("1.2.3.4"),
      pulumi.output("test-password"),
    );

    const script = await outputValue(result.vm.metadataStartupScript);
    const s = script as string;

    expect(s).toContain("<ip>10.0.0.100</ip>");
    expect(s).toContain("<ip>10.100.0.0/24</ip>");
    expect(s).toContain("<ip>127.0.0.1</ip>");
  });
});

describe("service accounts", () => {
  beforeEach(() => resetTestConfig());

  it("creates runtime and deploy SAs with correct names", async () => {
    const { loadConfig } = await import("../config");
    const { createServiceAccounts } = await import("../service-accounts");
    const cfg = loadConfig();
    const sas = createServiceAccounts(cfg);

    const runtimeName = await outputValue(sas.runtimeSa.accountId);
    expect(runtimeName).toBe("crt-test-run");

    const deployName = await outputValue(sas.deploySa.accountId);
    expect(deployName).toBe("crt-test-deploy");
  });
});

describe("workload identity", () => {
  beforeEach(() => resetTestConfig());

  it("creates pool and provider", async () => {
    const { loadConfig } = await import("../config");
    const { createServiceAccounts } = await import("../service-accounts");
    const { createWorkloadIdentity } = await import("../workload-identity");
    const cfg = loadConfig();
    const sas = createServiceAccounts(cfg);
    const wif = createWorkloadIdentity(cfg, sas.deploySa);

    expect(wif.pool).toBeDefined();
    expect(wif.provider).toBeDefined();

    const poolId = await outputValue(wif.pool.workloadIdentityPoolId);
    expect(poolId).toBe("crt-test-github");
  });
});

describe("artifact registry", () => {
  beforeEach(() => resetTestConfig());

  it("creates Docker repository with correct URL", async () => {
    const { loadConfig } = await import("../config");
    const { createArtifactRegistry } = await import("../artifact-registry");
    const cfg = loadConfig();
    const ar = createArtifactRegistry(cfg);

    const url = await outputValue(ar.registryUrl);
    expect(url).toContain("us-central1-docker.pkg.dev");

    const format = await outputValue(ar.repository.format);
    expect(format).toBe("DOCKER");
  });
});

describe("cloud run app", () => {
  beforeEach(() => resetTestConfig());

  it("creates service with correct name and resource limits (public access)", async () => {
    const { loadConfig, CADDY_HTTPS_PORT } = await import("../config");
    const { createSecrets } = await import("../secrets");
    const { createServiceAccounts } = await import("../service-accounts");
    const { createCloudRunApp } = await import("../cloud-run-app");
    const cfg = loadConfig();
    const secrets = createSecrets(cfg);
    const sas = createServiceAccounts(cfg);
    // Public access — no VPC access
    const chAccess = {
      url: pulumi.interpolate`https://ch-test.example.com:${CADDY_HTTPS_PORT}`,
    };
    const app = createCloudRunApp(cfg, sas.runtimeSa, secrets, chAccess);

    const name = await outputValue(app.service.name);
    expect(name).toBe("crt-test-app");
    expect(app.serviceUrl).toBeDefined();

    // Verify scaling and resource limits
    const template = await outputValue(app.service.template);
    expect(template.scaling?.minInstanceCount).toBe(cfg.appMinInstances);
    expect(template.scaling?.maxInstanceCount).toBe(cfg.appMaxInstances);
    expect(template.maxInstanceRequestConcurrency).toBe(cfg.appConcurrency);

    const container = template.containers?.[0];
    expect(container?.resources?.limits?.memory).toBe(cfg.appMemory);
    expect(container?.resources?.limits?.cpu).toBe(cfg.appCpu);

    // No VPC access for public access mode
    expect(template.vpcAccess).toBeUndefined();
  });

  it("creates service with VPC access (private access)", async () => {
    setTestConfig({ clickhousePublicAccess: "false" });
    const { loadConfig } = await import("../config");
    const { createSecrets } = await import("../secrets");
    const { createServiceAccounts } = await import("../service-accounts");
    const { createCloudRunApp } = await import("../cloud-run-app");
    const cfg = loadConfig();
    const secrets = createSecrets(cfg);
    const sas = createServiceAccounts(cfg);
    // Private access — VPC egress
    const chAccess = {
      url: pulumi.interpolate`http://10.101.0.2:39847`,
      vpcAccess: {
        network: pulumi.output("projects/test/global/networks/crt-production-vpc"),
        subnetwork: pulumi.output("projects/test/regions/us-central1/subnetworks/crt-production-subnet"),
      },
    };
    const app = createCloudRunApp(cfg, sas.runtimeSa, secrets, chAccess);

    const template = await outputValue(app.service.template);
    expect(template.vpcAccess).toBeDefined();
    expect(template.vpcAccess?.egress).toBe("PRIVATE_RANGES_ONLY");
    expect(template.vpcAccess?.networkInterfaces).toHaveLength(1);
  });
});

describe("cloud run jobs", () => {
  beforeEach(() => resetTestConfig());

  it("creates jobs without throwing (public access)", async () => {
    const { loadConfig, CADDY_HTTPS_PORT } = await import("../config");
    const { createSecrets } = await import("../secrets");
    const { createServiceAccounts } = await import("../service-accounts");
    const { createCloudRunJobs } = await import("../cloud-run-jobs");
    const cfg = loadConfig();
    const secrets = createSecrets(cfg);
    const sas = createServiceAccounts(cfg);
    const chAccess = {
      url: pulumi.interpolate`https://ch-test.example.com:${CADDY_HTTPS_PORT}`,
    };

    expect(() => createCloudRunJobs(cfg, sas.runtimeSa, secrets, chAccess)).not.toThrow();
  });

  it("creates jobs with VPC access (private access)", async () => {
    setTestConfig({ clickhousePublicAccess: "false" });
    const { loadConfig } = await import("../config");
    const { createSecrets } = await import("../secrets");
    const { createServiceAccounts } = await import("../service-accounts");
    const { createCloudRunJobs } = await import("../cloud-run-jobs");
    const cfg = loadConfig();
    const secrets = createSecrets(cfg);
    const sas = createServiceAccounts(cfg);
    const chAccess = {
      url: pulumi.interpolate`http://10.101.0.2:39847`,
      vpcAccess: {
        network: pulumi.output("projects/test/global/networks/crt-production-vpc"),
        subnetwork: pulumi.output("projects/test/regions/us-central1/subnetworks/crt-production-subnet"),
      },
    };

    // Should not throw — VPC access passed through to jobs
    expect(() => createCloudRunJobs(cfg, sas.runtimeSa, secrets, chAccess)).not.toThrow();
  });
});

describe("backups", () => {
  beforeEach(() => resetTestConfig());

  it("creates snapshot schedule with 14-day retention", async () => {
    const { loadConfig } = await import("../config");
    const { createClickHouseVM } = await import("../clickhouse");
    const { createBackups } = await import("../backups");
    const cfg = loadConfig();

    const ch = createClickHouseVM(
      cfg,
      pulumi.output("test-vpc"),
      pulumi.output("test-subnet"),
      pulumi.output("1.2.3.4"),
      pulumi.output("test-password"),
    );

    // Should not throw
    expect(() => createBackups(cfg, ch.vm)).not.toThrow();
  });
});

describe("vpc peering", () => {
  beforeEach(() => resetTestConfig());

  it("does nothing when workerVpcNetwork is not set", async () => {
    const { loadConfig } = await import("../config");
    const { createVpcPeering } = await import("../vpc-peering");
    const gcp = await import("@pulumi/gcp");
    const cfg = loadConfig();
    expect(cfg.workerVpcNetwork).toBeUndefined();

    // createVpcPeering with no workerVpcNetwork should be a no-op
    const mockVpc = new gcp.compute.Network("test-vpc-peer-1", { name: "test-vpc-peer-1", autoCreateSubnetworks: false });
    expect(() => createVpcPeering(cfg, mockVpc)).not.toThrow();
  });

  it("creates bidirectional peering when workerVpcNetwork is set", async () => {
    setTestConfig({ workerVpcNetwork: "external-vpc" });
    const { loadConfig } = await import("../config");
    const { createVpcPeering } = await import("../vpc-peering");
    const gcp = await import("@pulumi/gcp");
    const cfg = loadConfig();

    const mockVpc = new gcp.compute.Network("test-vpc-peer-2", { name: "test-vpc-peer-2", autoCreateSubnetworks: false });
    // Should not throw — creates bidirectional peering
    expect(() => createVpcPeering(cfg, mockVpc)).not.toThrow();
  });
});

describe("schedules sync", () => {
  it("every job in cloud-run-jobs.ts has a matching entry in schedules.json", () => {
    const schedulesPath = path.resolve(__dirname, "../../pipeline/schedules.json");
    const schedules = JSON.parse(fs.readFileSync(schedulesPath, "utf-8"));
    const scheduleNames = new Set(Object.keys(schedules));

    const jobsSrc = fs.readFileSync(path.resolve(__dirname, "../cloud-run-jobs.ts"), "utf-8");
    const jobNameMatches = [...jobsSrc.matchAll(/{\s*name:\s*"([^"]+)",\s*args:/g)];
    const jobNames = jobNameMatches.map((m: RegExpMatchArray) => m[1]);

    expect(jobNames.length).toBeGreaterThan(0);

    for (const name of jobNames) {
      expect(scheduleNames.has(name), `Job '${name}' in cloud-run-jobs.ts has no entry in schedules.json`).toBe(true);
    }

    const jobNameSet = new Set(jobNames);
    for (const name of scheduleNames) {
      expect(jobNameSet.has(name), `Schedule '${name}' in schedules.json has no Cloud Run Job in cloud-run-jobs.ts`).toBe(true);
    }
  });

  it("job timeouts are consistent with schedule maxRuntime", () => {
    const schedulesPath = path.resolve(__dirname, "../../pipeline/schedules.json");
    const schedules = JSON.parse(fs.readFileSync(schedulesPath, "utf-8")) as Record<string, { maxRuntime: number }>;

    const jobsSrc = fs.readFileSync(path.resolve(__dirname, "../cloud-run-jobs.ts"), "utf-8");
    const jobMatches = [...jobsSrc.matchAll(/name:\s*"([^"]+)".*?timeout:\s*"(\d+)s"/gs)];

    for (const match of jobMatches) {
      const name = match[1];
      const timeoutSecs = parseInt(match[2], 10);
      const schedule = schedules[name];
      if (!schedule) continue;

      const maxRuntimeSecs = schedule.maxRuntime * 60;
      expect(
        timeoutSecs,
        `Job '${name}' timeout (${timeoutSecs}s) should be >= schedule maxRuntime (${maxRuntimeSecs}s)`,
      ).toBeGreaterThanOrEqual(maxRuntimeSecs);
    }
  });
});

describe("stack outputs", () => {
  beforeEach(() => resetTestConfig());

  it("exports all required outputs", async () => {
    const outputs = await import("../index");

    expect(outputs.clickhouseExternalIp).toBeDefined();
    expect(outputs.clickhouseInternalIp).toBeDefined();
    expect(outputs.clickhouseVmName).toBeDefined();
    expect(outputs.clickhouseUrl).toBeDefined();
    expect(outputs.clickhousePassword).toBeDefined();
    expect(outputs.appUrl).toBeDefined();
    expect(outputs.workloadIdentityProvider).toBeDefined();
    expect(outputs.deployServiceAccountEmail).toBeDefined();
    expect(outputs.runtimeServiceAccountEmail).toBeDefined();
  });

  it("exports artifactRegistryUrl when not skipped", async () => {
    const outputs = await import("../index");
    // Default config has skipArtifactRegistry: false
    expect(outputs.artifactRegistryUrl).toBeDefined();
  });
});
