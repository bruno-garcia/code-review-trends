import * as pulumi from "@pulumi/pulumi";
import { vi } from "vitest";

// Mock Pulumi runtime for unit tests — no cloud calls needed
pulumi.runtime.setMocks({
  newResource(args: pulumi.runtime.MockResourceArgs): {
    id: string;
    state: Record<string, unknown>;
  } {
    const state = { ...args.inputs };

    // RandomPassword generates a `result` output not present in inputs
    if (args.type === "random:index/randomPassword:RandomPassword") {
      state.result = "a".repeat(args.inputs.length as number || 32);
    }

    return {
      id: `${args.name}-id`,
      state,
    };
  },
  call(args: pulumi.runtime.MockCallArgs): Record<string, unknown> {
    return args.inputs;
  },
});

// Mock Pulumi config
vi.mock("@pulumi/pulumi", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof pulumi;

  class MockConfig {
    private values: Record<string, string> = {
      environment: "test",
      clickhouseMachineType: "e2-medium",
      clickhouseDiskSizeGb: "20",
      clickhouseDomain: "ch-test.example.com",
    };

    require(key: string): string {
      const val = this.values[key];
      if (!val) throw new Error(`Missing config: ${key}`);
      return val;
    }

    requireNumber(key: string): number {
      return parseInt(this.require(key), 10);
    }

    requireSecret(key: string): pulumi.Output<string> {
      return pulumi.output(this.require(key));
    }

    requireBoolean(key: string): boolean {
      return this.require(key) === "true";
    }
  }

  return {
    ...actual,
    Config: MockConfig,
  };
});
