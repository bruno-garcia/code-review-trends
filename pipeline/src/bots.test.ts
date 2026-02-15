/**
 * Tests for the bot and product registry.
 *
 * Validates that derived maps are built correctly and that
 * products and bots are consistent.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
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

  it("has 28 bots", () => {
    assert.equal(BOTS.length, 28);
  });
});

describe("product registry", () => {
  it("has 23 products", () => {
    assert.equal(PRODUCTS.length, 23);
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
});
