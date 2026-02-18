# Contributing

Thanks for your interest in contributing to Code Review Trends!

## License

This project is licensed under the [Functional Source License (FSL-1.1-Apache-2.0)](LICENSE). By submitting a contribution, you agree that your contribution will be licensed under the same terms.

**Important:** The FSL is a source-available license, not an open-source license. It prohibits commercial use that competes with this project. On the Change Date (2028-02-14), the code converts to the Apache License 2.0. See the [LICENSE](LICENSE) file for full details.

## How to Contribute

### Reporting Bugs

- Open a [GitHub Issue](https://github.com/bruno-garcia/code-review-trends/issues) with a clear description.
- Include steps to reproduce, expected behavior, and actual behavior.
- For security vulnerabilities, see [SECURITY.md](SECURITY.md) instead.

### Suggesting a New Bot

If you know of an AI code review bot that we're not tracking:

1. Check the [current bot list](pipeline/src/bots.ts).
2. Open an issue with the bot's GitHub login, product name, and website.
3. Or submit a PR — see [Adding a New Bot](AGENTS.md#adding-a-new-bot) in AGENTS.md.

### Submitting Code

1. Fork the repository and create a branch: `<type>/<short-description>` (e.g., `fix/chart-tooltip`, `feat/new-metric`).
2. Follow the conventions in [AGENTS.md](AGENTS.md#conventions).
3. Ensure all checks pass: `npm run lint`, `npm run build --workspace=app`, `npm run test:e2e --workspace=app`.
4. Open a pull request against `main`.

### Development Setup

```bash
npm install
npm run dev    # Starts ClickHouse (Docker) + Next.js dev server
```

See [AGENTS.md](AGENTS.md#dev-environment) for detailed setup instructions, pipeline tools, and testing guides.

## Code of Conduct

Be respectful and constructive. We're building something useful for the developer community — let's keep it welcoming.
