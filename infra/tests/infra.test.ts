import { describe, it, expect } from "vitest";
import * as pulumi from "@pulumi/pulumi";

// Setup mocks before importing infra modules
import "./setup";

// Helper to resolve Pulumi outputs in tests
function outputValue<T>(output: pulumi.Output<T>): Promise<T> {
  return new Promise((resolve) => output.apply(resolve));
}

describe("config", () => {
  it("loads environment config with correct prefix", async () => {
    const { loadConfig } = await import("../config");
    const cfg = loadConfig();

    expect(cfg.environment).toBe("test");
    expect(cfg.namePrefix).toBe("crt-test");
    expect(cfg.clickhouseMachineType).toBe("e2-medium");
    expect(cfg.clickhouseDiskSizeGb).toBe(20);

    const domain = await outputValue(cfg.clickhouseDomain);
    expect(domain).toBe("ch-test.example.com");
  });

  it("exports port constants", async () => {
    const { CLICKHOUSE_HTTP_PORT, CADDY_HTTPS_PORT } = await import(
      "../config"
    );
    // Ports should be non-standard (not 8123, not 443)
    expect(CLICKHOUSE_HTTP_PORT).toBeGreaterThan(1024);
    expect(CLICKHOUSE_HTTP_PORT).not.toBe(8123);
    expect(CADDY_HTTPS_PORT).toBeGreaterThan(1024);
    expect(CADDY_HTTPS_PORT).not.toBe(443);
  });
});

describe("network", () => {
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

  it("uses isolated subnet CIDR from config constant", async () => {
    const { loadConfig, SUBNET_CIDR } = await import("../config");
    const { createNetwork } = await import("../network");
    const cfg = loadConfig();
    const network = createNetwork(cfg);

    const cidr = await outputValue(network.subnet.ipCidrRange);
    expect(cidr).toBe(SUBNET_CIDR);
    expect(cidr).toBe("10.100.0.0/24");
  });
});

describe("firewall", () => {
  it("creates firewall rules with correct tags", async () => {
    // Firewall function is void, so we test by importing and running
    // without errors. Detailed assertions happen via Pulumi mocks.
    const { loadConfig } = await import("../config");
    const { createFirewallRules } = await import("../firewall");
    const cfg = loadConfig();

    // Should not throw
    createFirewallRules(cfg, pulumi.output("test-vpc"));
  });
});

describe("secrets", () => {
  it("generates a password of sufficient length", async () => {
    const { loadConfig } = await import("../config");
    const { createSecrets } = await import("../secrets");
    const cfg = loadConfig();
    const secrets = createSecrets(cfg);

    const password = await outputValue(secrets.clickhousePassword);
    expect(password.length).toBeGreaterThanOrEqual(32);
  });
});

describe("clickhouse VM", () => {
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

  it("startup script contains required components", async () => {
    const { loadConfig } = await import("../config");
    const { createClickHouseVM, } = await import("../clickhouse");
    const { CLICKHOUSE_HTTP_PORT, CADDY_HTTPS_PORT } = await import(
      "../config"
    );
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

    // ClickHouse installation (skipped on subsequent boots)
    expect(s).toContain("clickhouse-server");
    expect(s).toContain("clickhouse-client");
    expect(s).toContain("First boot");
    expect(s).toContain("Packages already installed");

    // GPG keys imported in batch mode (no TTY required)
    expect(s).toContain("gpg --batch --yes --dearmor");

    // ClickHouse listens on localhost only
    expect(s).toContain("<listen_host>127.0.0.1</listen_host>");
    expect(s).toContain(`<http_port>${CLICKHOUSE_HTTP_PORT}</http_port>`);

    // Memory limits — server capped at 90% of RAM, per-query at 1GB
    expect(s).toContain(
      "<max_server_memory_usage_to_ram_ratio>0.9</max_server_memory_usage_to_ram_ratio>",
    );
    expect(s).toContain("<max_memory_usage>1000000000</max_memory_usage>");

    // Password is injected and hashed via SHA256
    expect(s).toContain("test-password-123");
    expect(s).not.toContain("CHANGE_ME");
    expect(s).toContain("password_sha256_hex");
    expect(s).toContain("sha256sum");

    // Readiness check with error handling
    expect(s).toContain("ClickHouse did not become ready");

    // Caddy config uses explicit IPv4 (not 'localhost' which resolves to ::1)
    expect(s).toContain("ch-test.example.com");
    expect(s).toContain(String(CADDY_HTTPS_PORT));
    expect(s).toContain("reverse_proxy 127.0.0.1:");
    expect(s).not.toContain("reverse_proxy localhost:");

    // Health-check watchdog restarts Caddy if it stops responding
    expect(s).toContain("caddy-watchdog");
    expect(s).toContain("systemctl restart caddy");
    // Watchdog checks Caddy's HTTP port (always :80 for ACME) via IPv4
    expect(s).toContain("http://127.0.0.1:80/");
    // Watchdog skips check if Caddy isn't active yet (boot race)
    expect(s).toContain("systemctl is-active --quiet caddy");

    // Database creation
    expect(s).toContain("CREATE DATABASE IF NOT EXISTS code_review_trends");
  });
});

describe("stack outputs", () => {
  it("exports all required outputs", async () => {
    const outputs = await import("../index");

    expect(outputs.clickhouseExternalIp).toBeDefined();
    expect(outputs.clickhouseInternalIp).toBeDefined();
    expect(outputs.clickhouseVmName).toBeDefined();
    expect(outputs.clickhouseUrl).toBeDefined();
    expect(outputs.clickhousePassword).toBeDefined();
  });
});
