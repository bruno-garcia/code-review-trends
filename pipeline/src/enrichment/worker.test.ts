/**
 * Tests for worker execution planning logic.
 *
 * planExecution determines:
 * - Which enrichment stages to run, in what order
 * - Whether combined PR+Comments enrichment runs
 * - Whether stale repos refresh runs
 *
 * Covers:
 * - Default mode (no flags): all stages in default order
 * - --only: exclusive single-stage, no combined, no stale refresh
 * - --priority: reorders but still runs all stages
 * - --priority repos: same as default order (repos already first)
 * - --priority with prs/comments: enables combined enrichment
 * - --priority with repos/reactions: disables combined enrichment
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  planExecution,
  DEFAULT_ORDER,
  type Step,
} from "./worker.js";

describe("planExecution", () => {
  // ── Default mode (no flags) ──────────────────────────────────────────

  describe("default mode (no flags)", () => {
    it("returns all stages in default order", () => {
      const plan = planExecution({});
      assert.deepEqual(plan.order, [...DEFAULT_ORDER]);
      assert.equal(plan.runCombined, true);
      assert.equal(plan.runStaleRefresh, true);
    });
  });

  // ── --only mode ──────────────────────────────────────────────────────

  describe("--only mode", () => {
    for (const stage of ["repos", "prs", "comments", "reactions"] as Step[]) {
      it(`--only ${stage}: runs exactly that stage`, () => {
        const plan = planExecution({ only: stage });
        assert.deepEqual(plan.order, [stage]);
      });
    }

    it("disables combined enrichment", () => {
      const plan = planExecution({ only: "reactions" });
      assert.equal(plan.runCombined, false);
    });

    it("disables combined even for --only prs", () => {
      const plan = planExecution({ only: "prs" });
      assert.equal(plan.runCombined, false);
    });

    it("disables combined even for --only comments", () => {
      const plan = planExecution({ only: "comments" });
      assert.equal(plan.runCombined, false);
    });

    it("disables stale refresh", () => {
      const plan = planExecution({ only: "repos" });
      assert.equal(plan.runStaleRefresh, false);
    });

    it("--only takes precedence over --priority", () => {
      const plan = planExecution({ only: "reactions", priority: "comments" });
      assert.deepEqual(plan.order, ["reactions"]);
      assert.equal(plan.runCombined, false);
      assert.equal(plan.runStaleRefresh, false);
    });
  });

  // ── --priority mode ──────────────────────────────────────────────────

  describe("--priority mode", () => {
    it("--priority reactions: moves reactions to front, keeps rest in default relative order", () => {
      const plan = planExecution({ priority: "reactions" });
      assert.deepEqual(plan.order, ["reactions", "repos", "comments", "prs"]);
    });

    it("--priority comments: moves comments to front", () => {
      const plan = planExecution({ priority: "comments" });
      assert.deepEqual(plan.order, ["comments", "repos", "reactions", "prs"]);
    });

    it("--priority prs: moves prs to front", () => {
      const plan = planExecution({ priority: "prs" });
      assert.deepEqual(plan.order, ["prs", "repos", "reactions", "comments"]);
    });

    it("--priority repos: same as default order (repos already first)", () => {
      const plan = planExecution({ priority: "repos" });
      assert.deepEqual(plan.order, [...DEFAULT_ORDER]);
    });

    it("--priority repos: disables combined enrichment", () => {
      const plan = planExecution({ priority: "repos" });
      assert.equal(plan.runCombined, false);
    });

    it("--priority reactions: disables combined enrichment", () => {
      const plan = planExecution({ priority: "reactions" });
      assert.equal(plan.runCombined, false);
    });

    it("--priority prs: enables combined enrichment", () => {
      const plan = planExecution({ priority: "prs" });
      assert.equal(plan.runCombined, true);
    });

    it("--priority comments: enables combined enrichment", () => {
      const plan = planExecution({ priority: "comments" });
      assert.equal(plan.runCombined, true);
    });

    it("always enables stale refresh", () => {
      const plan = planExecution({ priority: "reactions" });
      assert.equal(plan.runStaleRefresh, true);
    });
  });

  // ── Constants ────────────────────────────────────────────────────────

  describe("constants", () => {
    it("DEFAULT_ORDER has all 4 stages", () => {
      assert.equal(DEFAULT_ORDER.length, 4);
      assert.ok(DEFAULT_ORDER.includes("repos"));
      assert.ok(DEFAULT_ORDER.includes("prs"));
      assert.ok(DEFAULT_ORDER.includes("comments"));
      assert.ok(DEFAULT_ORDER.includes("reactions"));
    });

    it("DEFAULT_ORDER puts reactions before comments and prs", () => {
      const ri = DEFAULT_ORDER.indexOf("reactions");
      const ci = DEFAULT_ORDER.indexOf("comments");
      const pi = DEFAULT_ORDER.indexOf("prs");
      assert.ok(ri < ci, "reactions should come before comments");
      assert.ok(ri < pi, "reactions should come before prs");
    });
  });
});
