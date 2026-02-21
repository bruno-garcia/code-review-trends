/**
 * Tests for GraphQL repo batch processing.
 *
 * Covers the buildResults function which parses GraphQL responses
 * into GraphQLRepoResult arrays. Key scenarios:
 * - Normal repo responses
 * - Null repos (deleted/not found)
 * - Multiple repos in one batch
 * - Missing primaryLanguage (null)
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildResults } from "./graphql-repos.js";

describe("graphql-repos buildResults", () => {
  it("parses a successful repo response", () => {
    const repoNames = ["owner/my-repo"];
    const data = {
      r0: {
        stargazerCount: 1500,
        primaryLanguage: { name: "TypeScript" },
        isFork: false,
        isArchived: false,
      },
    };

    const results = buildResults(repoNames, data);
    assert.equal(results.length, 1);
    assert.equal(results[0].status, "ok");
    assert.equal(results[0].row.name, "owner/my-repo");
    assert.equal(results[0].row.owner, "owner");
    assert.equal(results[0].row.stars, 1500);
    assert.equal(results[0].row.primary_language, "TypeScript");
    assert.equal(results[0].row.fork, false);
    assert.equal(results[0].row.archived, false);
    assert.equal(results[0].row.fetch_status, "ok");
  });

  it("handles null repo (not found)", () => {
    const repoNames = ["owner/gone-repo"];
    const data = { r0: null };

    const results = buildResults(repoNames, data);
    assert.equal(results.length, 1);
    assert.equal(results[0].status, "not_found");
    assert.equal(results[0].row.name, "owner/gone-repo");
    assert.equal(results[0].row.fetch_status, "not_found");
    assert.equal(results[0].row.stars, 0);
  });

  it("handles undefined repo (missing from response)", () => {
    const repoNames = ["owner/missing"];
    const data = {}; // r0 not present at all

    const results = buildResults(repoNames, data);
    assert.equal(results.length, 1);
    assert.equal(results[0].status, "not_found");
  });

  it("handles null primaryLanguage", () => {
    const repoNames = ["owner/no-lang"];
    const data = {
      r0: {
        stargazerCount: 100,
        primaryLanguage: null,
        isFork: true,
        isArchived: true,
      },
    };

    const results = buildResults(repoNames, data);
    assert.equal(results[0].status, "ok");
    assert.equal(results[0].row.primary_language, "");
    assert.equal(results[0].row.fork, true);
    assert.equal(results[0].row.archived, true);
  });

  it("handles multiple repos in one batch", () => {
    const repoNames = ["org/repo-a", "org/repo-b", "org/repo-c"];
    const data = {
      r0: {
        stargazerCount: 500,
        primaryLanguage: { name: "Go" },
        isFork: false,
        isArchived: false,
      },
      r1: null, // not found
      r2: {
        stargazerCount: 200,
        primaryLanguage: { name: "Rust" },
        isFork: false,
        isArchived: false,
      },
    };

    const results = buildResults(repoNames, data);
    assert.equal(results.length, 3);

    assert.equal(results[0].status, "ok");
    assert.equal(results[0].row.name, "org/repo-a");
    assert.equal(results[0].row.stars, 500);

    assert.equal(results[1].status, "not_found");
    assert.equal(results[1].row.name, "org/repo-b");

    assert.equal(results[2].status, "ok");
    assert.equal(results[2].row.name, "org/repo-c");
    assert.equal(results[2].row.stars, 200);
  });

  it("correctly splits owner from repo name", () => {
    const repoNames = ["my-org/my-repo"];
    const data = {
      r0: {
        stargazerCount: 0,
        primaryLanguage: null,
        isFork: false,
        isArchived: false,
      },
    };

    const results = buildResults(repoNames, data);
    assert.equal(results[0].row.owner, "my-org");
    assert.equal(results[0].row.name, "my-org/my-repo");
  });

  it("returns empty array for empty input", () => {
    const results = buildResults([], {});
    assert.equal(results.length, 0);
  });
});
