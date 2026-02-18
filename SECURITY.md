# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Code Review Trends, please report it responsibly:

**Email:** [security@codereviewtrends.com](mailto:security@codereviewtrends.com)

Please **do not** open a public GitHub issue for security vulnerabilities.

### What to include

- A description of the vulnerability and its potential impact.
- Steps to reproduce, if possible.
- Any suggested mitigation or fix.

### What to expect

- **Acknowledgment** within 48 hours.
- An assessment and timeline for a fix within 7 days.
- Credit in the fix commit and/or release notes (unless you prefer to remain anonymous).

## Scope

The following are in scope:

- The web application at [codereviewtrends.com](https://codereviewtrends.com)
- The data pipeline (BigQuery queries, GitHub API client, ClickHouse writes)
- Infrastructure-as-code (Pulumi) configurations
- CI/CD workflows

The following are **out of scope**:

- Third-party services (GitHub, BigQuery, Sentry, GCP) — report those to the respective providers.
- Denial-of-service attacks against production infrastructure.
- Social engineering.

## Security Practices

- **No secrets in source.** Credentials are stored in GCP Secret Manager (production) or Pulumi encrypted config. Local dev uses `.env.local` (gitignored).
- **Parameterized queries.** All ClickHouse queries use `{param:Type}` syntax — no string interpolation of user input.
- **Workload Identity Federation.** CI/CD authenticates to GCP via OIDC tokens, not long-lived service account keys.
- **Minimal permissions.** Runtime service accounts have only the IAM roles they need.
- **Rate limiting.** Cloudflare handles edge-level rate limiting and bot protection.
