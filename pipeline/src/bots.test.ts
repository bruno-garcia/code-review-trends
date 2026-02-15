/**
 * Tests for the bot registry.
 *
 * Validates that derived maps are built correctly and that
 * multi-login bots are handled properly.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BOTS, BOT_BY_LOGIN, BOT_BY_ID, BOT_LOGINS } from "./bots.js";

describe("bot registry", () => {
  it("every bot has at least one login", () => {
    for (const bot of BOTS) {
      assert.ok(
        bot.github_logins.length > 0,
        `Bot "${bot.id}" has no github_logins`,
      );
    }
  });

  it("BOT_BY_LOGIN maps every login to its bot", () => {
    for (const bot of BOTS) {
      for (const login of bot.github_logins) {
        const found = BOT_BY_LOGIN.get(login);
        assert.ok(found, `Login "${login}" not found in BOT_BY_LOGIN`);
        assert.equal(found.id, bot.id);
      }
    }
  });

  it("BOT_BY_LOGIN has exactly as many entries as total logins", () => {
    const totalLogins = BOTS.reduce((sum, b) => sum + b.github_logins.length, 0);
    assert.equal(BOT_BY_LOGIN.size, totalLogins);
  });

  it("BOT_LOGINS contains all logins", () => {
    for (const bot of BOTS) {
      for (const login of bot.github_logins) {
        assert.ok(BOT_LOGINS.has(login), `Login "${login}" not in BOT_LOGINS`);
      }
    }
    const totalLogins = BOTS.reduce((sum, b) => sum + b.github_logins.length, 0);
    assert.equal(BOT_LOGINS.size, totalLogins);
  });

  it("no duplicate logins across bots", () => {
    const seen = new Map<string, string>();
    for (const bot of BOTS) {
      for (const login of bot.github_logins) {
        const existing = seen.get(login);
        assert.ok(
          !existing,
          `Login "${login}" is claimed by both "${existing}" and "${bot.id}"`,
        );
        seen.set(login, bot.id);
      }
    }
  });

  it("no duplicate bot ids", () => {
    const ids = BOTS.map((b) => b.id);
    const unique = new Set(ids);
    assert.equal(ids.length, unique.size, "Duplicate bot ids found");
  });

  it("BOT_BY_ID maps every bot", () => {
    for (const bot of BOTS) {
      assert.equal(BOT_BY_ID.get(bot.id), bot);
    }
    assert.equal(BOT_BY_ID.size, BOTS.length);
  });

  it("multi-login bot maps all logins to the same definition", () => {
    // Create a synthetic test by checking that a bot with >1 login
    // would map all logins to the same object. For now just verify
    // the structure works for all current bots.
    for (const bot of BOTS) {
      const mappedBots = bot.github_logins.map((l) => BOT_BY_LOGIN.get(l));
      for (const mapped of mappedBots) {
        assert.strictEqual(mapped, bot, `All logins for "${bot.id}" should map to the same object`);
      }
    }
  });
});

describe("seed data consistency", () => {
  it("seed SQL bot ids match bots.ts", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const seedPath = path.join(import.meta.dirname, "../../db/init/002_seed.sql");
    const seedSql = fs.readFileSync(seedPath, "utf-8");

    // Extract bot ids from seed INSERT INTO bots
    const botsInsertMatch = seedSql.match(
      /INSERT INTO code_review_trends\.bots[^;]+;/s,
    );
    assert.ok(botsInsertMatch, "Could not find bots INSERT in seed SQL");

    const seedBotIds = [...botsInsertMatch[0].matchAll(/\('(\w+)',/g)].map(
      (m) => m[1],
    );
    const registryBotIds = BOTS.map((b) => b.id).sort();

    assert.deepEqual(
      seedBotIds.sort(),
      registryBotIds,
      `Seed bot ids ${JSON.stringify(seedBotIds.sort())} don't match bots.ts ${JSON.stringify(registryBotIds)}`,
    );
  });

  it("seed SQL bot logins match bots.ts", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const seedPath = path.join(import.meta.dirname, "../../db/init/002_seed.sql");
    const seedSql = fs.readFileSync(seedPath, "utf-8");

    // Extract (bot_id, github_login) pairs from seed INSERT INTO bot_logins
    const loginsInsertMatch = seedSql.match(
      /INSERT INTO code_review_trends\.bot_logins[^;]+;/s,
    );
    assert.ok(loginsInsertMatch, "Could not find bot_logins INSERT in seed SQL");

    const seedPairs = [
      ...loginsInsertMatch[0].matchAll(/\('(\w+)',\s*'([^']+)'\)/g),
    ].map((m) => `${m[1]}:${m[2]}`);

    const registryPairs = BOTS.flatMap((b) =>
      b.github_logins.map((l) => `${b.id}:${l}`),
    ).sort();

    assert.deepEqual(
      seedPairs.sort(),
      registryPairs,
      `Seed bot_logins don't match bots.ts`,
    );
  });
});
