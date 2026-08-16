# Contributing

Thanks for helping improve the Recap Raven Obsidian plugin.

## Before opening an issue

Use GitHub issues for reproducible bugs and focused feature requests. Search existing issues first and use synthetic examples. Never post API keys, authorization headers, private campaign material, or vault contents. Report security concerns privately through [SECURITY.md](SECURITY.md).

## Development

Development is Docker-first. From the repository root, run:

```bash
make check
```

This installs the locked dependencies in the pinned Node container, runs ESLint, executes the Vitest suite with enforced coverage thresholds, type-checks the strict TypeScript project, and builds the production bundle.

Keep changes small and include tests for happy paths, failures, hostile input, and platform behavior where relevant. Do not weaken lint or coverage rules to make a change pass.

## Pull requests

- Explain the user-visible behavior and security or privacy impact.
- Add or update tests and documentation.
- Keep networking manual and restricted to the documented Recap Raven origins.
- Preserve create-only vault writes and campaign-bound, player-safe access.
- Ensure `make check` and the public CI/security workflows pass.

By contributing, you agree that your contribution is licensed under the repository's [MIT licence](LICENSE).
