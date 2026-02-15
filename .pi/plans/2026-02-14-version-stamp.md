# Version Stamp & Deployment Skew Protection

**Date:** 2026-02-14
**Status:** Active
**Directory:** /Users/bruno/git/code-review-trends-2

## Overview

Add a visible commit SHA in the footer so the deployed version is always identifiable, and enable Next.js built-in deployment skew protection so stale clients auto-reload when a new version is deployed.

## Goals

- Show short commit SHA in the page footer with click-to-copy
- Enable `deploymentId` in Next.js config for automatic skew detection + hard reload
- Keep it simple, modular, and tested

## Approach

Use Next.js's built-in `deploymentId` config option. When set, Next.js bakes the ID into the client bundle and sends it as `x-deployment-id` on every client-side RSC navigation. If the server's ID differs from the client's, Next.js triggers a hard reload automatically. No custom skew logic needed.

### Key Decisions

- `deploymentId` source: `VERCEL_GIT_COMMIT_SHA` env var (provided by Vercel at build time), falling back to `git rev-parse HEAD` for local dev builds
- Footer component: server component reads env var, thin client wrapper for clipboard copy
- No polling, no custom API routes, no custom banner — Next.js handles skew natively

## Files

| File | Action |
|------|--------|
| `app/next.config.ts` | Modify — add `deploymentId` |
| `app/src/components/version-stamp.tsx` | Create — client component with SHA display + copy |
| `app/src/app/layout.tsx` | Modify — add VersionStamp to footer |
| `app/e2e/version.spec.ts` | Create — e2e test for version stamp |

## Risks & Open Questions

- In `next dev` mode, `deploymentId` may not trigger skew behavior (dev is always dynamic). That's fine — skew only matters in production.
- `git rev-parse` fallback only works when building in a git repo (CI and local dev both qualify).
