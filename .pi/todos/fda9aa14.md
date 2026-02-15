{
  "id": "fda9aa14",
  "title": "Task 5: Update bots.test.ts — product validation + seed consistency",
  "tags": [
    "product-expansion"
  ],
  "status": "closed",
  "created_at": "2026-02-15T05:15:35.301Z"
}

Plan: .pi/plans/2026-02-14-product-model-bot-expansion.md

## Task
Rewrite pipeline tests for the new product model. Validate product references, single-login per bot, seed data consistency with the expanded registry.

## Files
- `pipeline/src/bots.test.ts` (rewrite)

## Details

### Tests to add/update:
1. **Every bot has a valid product_id** — references an entry in PRODUCTS
2. **No duplicate product ids** 
3. **No duplicate bot ids**
4. **No duplicate github_logins across all bots**
5. **Every bot has exactly one github_login** (string, not array)
6. **BOT_BY_LOGIN maps every login** to its bot
7. **PRODUCT_BY_ID maps every product**
8. **BOTS_BY_PRODUCT groups correctly** — every bot appears under its product
9. **Multi-bot products have expected bot count** — Qodo=3, Sentry=3, LinearB=2
10. **Seed SQL consistency**: products INSERT matches PRODUCTS, bots INSERT matches BOTS, bot_logins INSERT matches

### Remove:
- Old multi-login tests (github_logins array tests)
- Update seed consistency to check products table too

## Acceptance Criteria
- [ ] All product/bot validation tests pass
- [ ] Seed consistency tests validate products, bots, and bot_logins tables
- [ ] `npm test --workspace=pipeline` passes

## Depends On
- Task 2 (bots.ts)
- Task 7 (seed data — for seed consistency tests)

## Completed\nAdded 5 new tests (20 total):\n- `every bot appears under its product in BOTS_BY_PRODUCT`\n- `multi-bot products have expected bot counts` (Qodo=3, Sentry=3, LinearB=2)\n- `products INSERT matches PRODUCTS array` (seed consistency)\n- `bots INSERT matches BOTS array` (seed consistency)\n- `bot_logins INSERT matches all bot logins` (seed consistency)\n\n17/20 pass. 3 seed consistency tests fail as expected (seed not yet updated — Task 7).
