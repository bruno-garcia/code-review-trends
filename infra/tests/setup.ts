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
    // Data sources used to read the current container image from Cloud Run.
    // Return a realistic shape so `currentAppImage` / `currentJobImage` resolve.
    // The GCP provider uses `templates` (plural) in data source results.
    if (args.token === "gcp:cloudrunv2/getService:getService") {
      return {
        ...args.inputs,
        templates: [
          { containers: [{ image: "us-docker.pkg.dev/test/app:abc123" }] },
        ],
      };
    }
    if (args.token === "gcp:cloudrunv2/getJob:getJob") {
      return {
        ...args.inputs,
        templates: [
          {
            templates: [
              {
                containers: [
                  { image: "us-docker.pkg.dev/test/pipeline:abc123" },
                ],
              },
            ],
          },
        ],
      };
    }
    return args.inputs;
  },
});

// Mock GCP config (project/region used by Cloud Run, Artifact Registry, etc.)
vi.mock("@pulumi/gcp", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    config: {
      ...(actual.config as Record<string, unknown>),
      project: "test-project",
      region: "us-central1",
    },
  };
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
      appDomain: "staging-test.example.com",
      artifactRegistryLocation: "us-central1",
      clickhousePublicAccess: "true",
      sentryDsnAppFrontend: "https://test-fe@sentry.io/app",
      sentryDsnAppBackend: "https://test-be@sentry.io/app",
      sentryDsnPipeline: "https://test@sentry.io/pipeline",
      sentryAuthToken: "sntrys_test_token",
      githubToken: "ghp_test_token",
      githubTokens: '["ghp_test_token_1","ghp_test_token_2","ghp_test_token_3","ghp_test_token_4"]',
      githubRepo: "test-owner/test-repo",
      alertEmail: "alerts@example.com",
    };

    get(key: string): string | undefined {
      return this.values[key];
    }

    getBoolean(key: string): boolean | undefined {
      const val = this.values[key];
      if (val === undefined) return undefined;
      return val === "true";
    }

    getNumber(key: string): number | undefined {
      const val = this.values[key];
      if (val === undefined) {
        return undefined;
      }
      const num = Number(val);
      if (Number.isNaN(num)) {
        throw new Error(`Configuration for '${key}' is not a valid number: '${val}'`);
      }
      return num;
    }

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
