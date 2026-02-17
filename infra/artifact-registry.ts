import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import { EnvironmentConfig } from "./config";

export interface ArtifactRegistryResult {
  repository: gcp.artifactregistry.Repository;
  registryUrl: pulumi.Output<string>;
}

/**
 * Creates a Docker repository in Artifact Registry for container images.
 *
 * NOTE: This is a project-level resource, not environment-scoped. Images are
 * tagged per environment (e.g. `staging-<sha>`, `prod-<sha>`). When a prod
 * stack is added, this should be created in only one stack or moved to a
 * shared bootstrap stack. For now it lives in the staging stack.
 */
export function createArtifactRegistry(
  cfg: EnvironmentConfig,
  parent?: pulumi.Resource,
): ArtifactRegistryResult {
  const repository = new gcp.artifactregistry.Repository(
    "crt",
    {
      repositoryId: "crt",
      location: cfg.artifactRegistryLocation,
      format: "DOCKER",
      description: "Container images for Code Review Trends",
      // Cleanup policy: keep the last 10 versions per image.
      // Requires Pulumi GCP provider v7+ with cleanupPolicies support.
      cleanupPolicies: [
        {
          id: "keep-last-10",
          action: "KEEP",
          mostRecentVersions: {
            keepCount: 10,
          },
        },
      ],
    },
    { parent },
  );

  const registryUrl = pulumi.interpolate`${cfg.artifactRegistryLocation}-docker.pkg.dev/${gcp.config.project}/crt`;

  return { repository, registryUrl };
}
