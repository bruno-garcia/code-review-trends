/**
 * Tests for worker execution planning logic.
 *
 * planExecution is a pure function that determines:
 * - Which enrichment stages to run, in what order
 * - Whether combined PR+Comments enrichment runs
 * - Whether stale repos refresh runs
 *
 * Covers:
 * - Default mode (no flags): all stages in default order
 * - --only: exclusive single-stage, no combined, no stale refresh
 * - --only: ignores completion threshold (runs even if >70%)
 * - --priority: reorders but still runs all stages
 * - --priority: disables threshold-based skipping
 * - --priority repos: same as default order (repos already first)
 * - --priority with prs/comments: enables combined enrichment
 * - --priority with repos/reactions: disables combined enrichment
 * - Threshold skipping in default mode: stages ≥70% complete are dropped
 * - Threshold skipping: all stages above threshold → run all (no empty order)
 * - Threshold skipping: all stages below threshold → run all (nothing to skip)
 * - Edge: completion at exactly the threshold boundary (70%)
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  planExecution,
  DEFAULT_ORDER,
  ROUND_ROBIN_THRESHOLD,
  type Step,
} from "./worker.js";

/** All stages at 0% completion. */
const ZERO: Record<Step, number> = { repos: 0, prs: 0, comments: 0, reactions: 0 };

/** All stages at 50% (below threshold). */
const ALL_50: Record<Step, number> = { repos: 0.5, prs: 0.5, comments: 0.5, reactions: 0.5 };

/** All stages at 80% (above threshold). */
const ALL_80: Record<Step, number> = { repos: 0.8, prs: 0.8, comments: 0.8, reactions: 0.8 };

/** Mixed: reactions high, others low — the exact scenario from the bug report. */
const MIXED_REACTIONS_HIGH: Record<Step, number> = { repos: 0.3, prs: 0.2, comments: 0.1, reactions: 0.86 };

/** Mixed: repos and reactions above threshold, others below. */
const MIXED_TWO_HIGH: Record<Step, number> = { repos: 0.75, prs: 0.2, comments: 0.1, reactions: 0.86 };

describe("planExecution", () => {
  // ── Default mode (no flags) ──────────────────────────────────────────

  describe("default mode (no flags)", () => {
    it("returns all stages in default order with zero completion", () => {
      const plan = planExecution({ completion: ZERO });
      assert.deepEqual(plan.order, [...DEFAULT_ORDER]);
      assert.equal(plan.runCombined, true);
      assert.equal(plan.runStaleRefresh, true);
    });

    it("returns all stages when all are below threshold", () => {
      const plan = planExecution({ completion: ALL_50 });
      assert.deepEqual(plan.order, [...DEFAULT_ORDER]);
    });

    it("returns all stages when ALL are above threshold (never produces empty order)", () => {
      const plan = planExecution({ completion: ALL_80 });
      // When all are above threshold, belowThreshold.length === 0,
      // so the condition `belowThreshold.length > 0` is false → keep all.
      assert.deepEqual(plan.order, [...DEFAULT_ORDER]);
    });

    it("enables combined enrichment", () => {
      const plan = planExecution({ completion: ZERO });
      assert.equal(plan.runCombined, true);
    });

    it("enables stale refresh", () => {
      const plan = planExecution({ completion: ZERO });
      assert.equal(plan.runStaleRefresh, true);
    });
  });

  // ── Threshold skipping (default mode) ────────────────────────────────

  describe("threshold skipping", () => {
    it("skips stages above 70% when some are below (the original bug scenario)", () => {
      const plan = planExecution({ completion: MIXED_REACTIONS_HIGH });
      // reactions at 86% should be skipped; repos, comments, prs should remain
      assert.ok(!plan.order.includes("reactions"), "reactions should be skipped");
      assert.ok(plan.order.includes("repos"), "repos should remain");
      assert.ok(plan.order.includes("comments"), "comments should remain");
      assert.ok(plan.order.includes("prs"), "prs should remain");
    });

    it("preserves relative order of remaining stages", () => {
      const plan = planExecution({ completion: MIXED_REACTIONS_HIGH });
      // Default order is repos, reactions, comments, prs
      // After removing reactions: repos, comments, prs
      assert.deepEqual(plan.order, ["repos", "comments", "prs"]);
    });

    it("skips multiple stages above threshold", () => {
      const plan = planExecution({ completion: MIXED_TWO_HIGH });
      assert.ok(!plan.order.includes("repos"), "repos at 75% should be skipped");
      assert.ok(!plan.order.includes("reactions"), "reactions at 86% should be skipped");
      assert.ok(plan.order.includes("comments"), "comments at 10% should remain");
      assert.ok(plan.order.includes("prs"), "prs at 20% should remain");
    });

    it("treats exactly 70% as AT threshold (not below)", () => {
      // ROUND_ROBIN_THRESHOLD is 0.70, filter is `< 0.70`, so exactly 0.70 is NOT below.
      const completion: Record<Step, number> = { repos: 0.70, prs: 0.5, comments: 0.5, reactions: 0.5 };
      const plan = planExecution({ completion });
      assert.ok(!plan.order.includes("repos"), "repos at exactly 70% should be skipped");
    });

    it("treats 69.9% as below threshold", () => {
      const completion: Record<Step, number> = { repos: 0.699, prs: 0.5, comments: 0.5, reactions: 0.5 };
      const plan = planExecution({ completion });
      assert.ok(plan.order.includes("repos"), "repos at 69.9% should remain");
    });
  });

  // ── --only mode ──────────────────────────────────────────────────────

  describe("--only mode", () => {
    for (const stage of ["repos", "prs", "comments", "reactions"] as Step[]) {
      it(`--only ${stage}: runs exactly that stage`, () => {
        const plan = planExecution({ only: stage, completion: ZERO });
        assert.deepEqual(plan.order, [stage]);
      });
    }

    it("disables combined enrichment", () => {
      const plan = planExecution({ only: "reactions", completion: ZERO });
      assert.equal(plan.runCombined, false);
    });

    it("disables combined even for --only prs", () => {
      const plan = planExecution({ only: "prs", completion: ZERO });
      assert.equal(plan.runCombined, false);
    });

    it("disables combined even for --only comments", () => {
      const plan = planExecution({ only: "comments", completion: ZERO });
      assert.equal(plan.runCombined, false);
    });

    it("disables stale refresh", () => {
      const plan = planExecution({ only: "repos", completion: ZERO });
      assert.equal(plan.runStaleRefresh, false);
    });

    it("ignores completion threshold — runs even if stage is above 70%", () => {
      // This is the key fix: --only reactions at 86% must still run
      const plan = planExecution({ only: "reactions", completion: MIXED_REACTIONS_HIGH });
      assert.deepEqual(plan.order, ["reactions"]);
    });

    it("ignores completion threshold — runs even if ALL stages are above 70%", () => {
      const plan = planExecution({ only: "repos", completion: ALL_80 });
      assert.deepEqual(plan.order, ["repos"]);
    });

    it("--only takes precedence over --priority", () => {
      // If both are somehow set, only should win
      const plan = planExecution({ only: "reactions", priority: "comments", completion: ZERO });
      assert.deepEqual(plan.order, ["reactions"]);
      assert.equal(plan.runCombined, false);
      assert.equal(plan.runStaleRefresh, false);
    });
  });

  // ── --priority mode ──────────────────────────────────────────────────

  describe("--priority mode", () => {
    it("--priority reactions: moves reactions to front, keeps rest in default relative order", () => {
      const plan = planExecution({ priority: "reactions", completion: ZERO });
      assert.deepEqual(plan.order, ["reactions", "repos", "comments", "prs"]);
    });

    it("--priority comments: moves comments to front", () => {
      const plan = planExecution({ priority: "comments", completion: ZERO });
      assert.deepEqual(plan.order, ["comments", "repos", "reactions", "prs"]);
    });

    it("--priority prs: moves prs to front", () => {
      const plan = planExecution({ priority: "prs", completion: ZERO });
      assert.deepEqual(plan.order, ["prs", "repos", "reactions", "comments"]);
    });

    it("--priority repos: same as default order (repos already first)", () => {
      const plan = planExecution({ priority: "repos", completion: ZERO });
      assert.deepEqual(plan.order, [...DEFAULT_ORDER]);
    });

    it("runs ALL stages regardless of completion (disables threshold skipping)", () => {
      // This is the existing behavior that caused the user's problem:
      // --priority disables threshold skipping, so all stages run.
      const plan = planExecution({ priority: "reactions", completion: MIXED_REACTIONS_HIGH });
      assert.equal(plan.order.length, 4, "all 4 stages should run");
      assert.equal(plan.order[0], "reactions", "priority stage should be first");
    });

    it("--priority repos: disables combined enrichment", () => {
      const plan = planExecution({ priority: "repos", completion: ZERO });
      // priority === "repos" → not "prs" or "comments" → no combined
      assert.equal(plan.runCombined, false);
    });

    it("--priority reactions: disables combined enrichment", () => {
      const plan = planExecution({ priority: "reactions", completion: ZERO });
      assert.equal(plan.runCombined, false);
    });

    it("--priority prs: enables combined enrichment", () => {
      const plan = planExecution({ priority: "prs", completion: ZERO });
      assert.equal(plan.runCombined, true);
    });

    it("--priority comments: enables combined enrichment", () => {
      const plan = planExecution({ priority: "comments", completion: ZERO });
      assert.equal(plan.runCombined, true);
    });

    it("always enables stale refresh", () => {
      const plan = planExecution({ priority: "reactions", completion: ALL_80 });
      assert.equal(plan.runStaleRefresh, true);
    });
  });

  // ── Constants ────────────────────────────────────────────────────────

  describe("constants", () => {
    it("ROUND_ROBIN_THRESHOLD is 70%", () => {
      assert.equal(ROUND_ROBIN_THRESHOLD, 0.70);
    });

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
