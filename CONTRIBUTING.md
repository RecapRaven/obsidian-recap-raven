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

This is an owner-maintained repository. Keeping implementation changes within the Recap Raven maintainership helps us preserve the reviewed release provenance, security boundaries, and Obsidian submission requirements. External code pull requests are closed automatically without running contributed code.

Please use an issue to report a bug or propose an improvement. Clear reproduction steps, expected behavior, and synthetic examples are welcome. If the change is accepted, a maintainer will implement it through the repository's tested pull-request process and credit the originating issue where appropriate.

By contributing, you agree that your contribution is licensed under the repository's [MIT licence](LICENSE).
