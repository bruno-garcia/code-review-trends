/**
 * Tests for the bot and product registry.
 *
 * Validates that derived maps are built correctly and that
 * products and bots are consistent.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BOTS,
  BOT_BY_LOGIN,
  BOT_BY_ID,
  BOT_LOGINS,
  PRODUCTS,
  PRODUCT_BY_ID,
  BOTS_BY_PRODUCT,
} from "./bots.js";

describe("bot registry", () => {
  it("every bot has a github_login", () => {
    for (const bot of BOTS) {
      assert.ok(
        bot.github_login.length > 0,
        `Bot "${bot.id}" has no github_login`,
      );
    }
  });

  it("BOT_BY_LOGIN maps every login to its bot", () => {
    for (const bot of BOTS) {
      const found = BOT_BY_LOGIN.get(bot.github_login);
      assert.ok(found, `Login "${bot.github_login}" not found in BOT_BY_LOGIN`);
      assert.equal(found.id, bot.id);
    }
  });

  it("BOT_BY_LOGIN has exactly as many entries as bots", () => {
    assert.equal(BOT_BY_LOGIN.size, BOTS.length);
  });

  it("BOT_LOGINS contains all logins", () => {
    for (const bot of BOTS) {
      assert.ok(
        BOT_LOGINS.has(bot.github_login),
        `Login "${bot.github_login}" not in BOT_LOGINS`,
      );
    }
    assert.equal(BOT_LOGINS.size, BOTS.length);
  });

  it("no duplicate logins across bots", () => {
    const seen = new Map<string, string>();
    for (const bot of BOTS) {
      const existing = seen.get(bot.github_login);
      assert.ok(
        !existing,
        `Login "${bot.github_login}" is claimed by both "${existing}" and "${bot.id}"`,
      );
      seen.set(bot.github_login, bot.id);
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

  it("every bot references a valid product", () => {
    for (const bot of BOTS) {
      assert.ok(
        PRODUCT_BY_ID.has(bot.product_id),
        `Bot "${bot.id}" references unknown product "${bot.product_id}"`,
      );
    }
  });

  it("has 30 bots", () => {
    assert.equal(BOTS.length, 30);
  });
});

describe("product registry", () => {
  it("has 25 products", () => {
    assert.equal(PRODUCTS.length, 25);
  });

  it("no duplicate product ids", () => {
    const ids = PRODUCTS.map((p) => p.id);
    const unique = new Set(ids);
    assert.equal(ids.length, unique.size, "Duplicate product ids found");
  });

  it("PRODUCT_BY_ID maps every product", () => {
    for (const product of PRODUCTS) {
      assert.equal(PRODUCT_BY_ID.get(product.id), product);
    }
    assert.equal(PRODUCT_BY_ID.size, PRODUCTS.length);
  });

  it("every product has at least one bot", () => {
    for (const product of PRODUCTS) {
      const bots = BOTS_BY_PRODUCT.get(product.id);
      assert.ok(
        bots && bots.length > 0,
        `Product "${product.id}" has no bots`,
      );
    }
  });

  it("BOTS_BY_PRODUCT covers all products", () => {
    assert.equal(BOTS_BY_PRODUCT.size, PRODUCTS.length);
  });

  it("Qodo name is just 'Qodo'", () => {
    const qodo = PRODUCT_BY_ID.get("qodo");
    assert.ok(qodo);
    assert.equal(qodo.name, "Qodo");
  });

  it("every bot appears under its product in BOTS_BY_PRODUCT", () => {
    for (const bot of BOTS) {
      const group = BOTS_BY_PRODUCT.get(bot.product_id);
      assert.ok(group, `No group for product "${bot.product_id}"`);
      assert.ok(
        group.some((b) => b.id === bot.id),
        `Bot "${bot.id}" missing from BOTS_BY_PRODUCT["${bot.product_id}"]`,
      );
    }
  });

  it("multi-bot products have expected bot counts", () => {
    const expected: Record<string, number> = {
      qodo: 3,
      sentry: 3,
      linearb: 2,
    };
    for (const [productId, count] of Object.entries(expected)) {
      const bots = BOTS_BY_PRODUCT.get(productId);
      assert.ok(bots, `Product "${productId}" not found`);
      assert.equal(
        bots.length,
        count,
        `Product "${productId}" expected ${count} bots, got ${bots.length}`,
      );
    }
  });
});

describe("seed SQL consistency", () => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const seedSql: string = readFileSync(
    join(__dirname, "../../db/init/002_bot_data.sql"),
    "utf-8",
  );

  /** Extract quoted values from a single-column pattern in the seed SQL. */
  function extractInsertValues(
    table: string,
    column: string,
  ): string[] {
    // Match the INSERT INTO ... (column) VALUES block and extract all single-quoted values
    const pattern = new RegExp(
      `INSERT INTO code_review_trends\\.${table}[^(]*\\(${column}[^)]*\\)\\s*VALUES\\s*([\\s\\S]*?)(?:;|$)`,
    );
    const match = seedSql.match(pattern);
    if (!match) return [];
    const valuesBlock = match[1];
    const values: string[] = [];
    const rowPattern = /\(([^)]+)\)/g;
    let m;
    while ((m = rowPattern.exec(valuesBlock)) !== null) {
      // First quoted value in each row
      const first = m[1].match(/'([^']+)'/);
      if (first) values.push(first[1]);
    }
    return values;
  }

  it("products INSERT matches PRODUCTS array", () => {
    const seedProductIds = extractInsertValues("products", "id");
    const registryIds = PRODUCTS.map((p) => p.id).sort();
    assert.deepEqual(
      seedProductIds.sort(),
      registryIds,
      "Seed products don't match PRODUCTS registry",
    );
  });

  it("bots INSERT matches BOTS array", () => {
    const seedBotIds = extractInsertValues("bots", "id");
    const registryIds = BOTS.map((b) => b.id).sort();
    assert.deepEqual(
      seedBotIds.sort(),
      registryIds,
      "Seed bots don't match BOTS registry",
    );
  });

  it("bot_logins INSERT matches all bot logins", () => {
    // bot_logins rows have (bot_id, login) — extract the logins (second quoted value)
    const pattern =
      /INSERT INTO code_review_trends\.bot_logins[^(]*\(([^)]+)\)\s*VALUES\s*([\s\S]*?)(?:;|$)/;
    const match = seedSql.match(pattern);
    const seedLogins: string[] = [];
    if (match) {
      const rowPattern = /\(\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/g;
      let m;
      while ((m = rowPattern.exec(match[2])) !== null) {
        seedLogins.push(m[2]);
      }
    }
    const registryLogins = BOTS.map((b) => b.github_login).sort();
    assert.deepEqual(
      seedLogins.sort(),
      registryLogins,
      "Seed bot_logins don't match bot github_logins",
    );
  });
});
