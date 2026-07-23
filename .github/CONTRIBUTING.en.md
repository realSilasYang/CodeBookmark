# Contributing

[简体中文](./CONTRIBUTING.md) · [English](./CONTRIBUTING.en.md)

Thank you for contributing issues, documentation, or code improvements to CodeBookmark.

Use the repository issue templates for ordinary defects, feature requests, and improvement proposals. Read [SUPPORT.en.md](SUPPORT.en.md) first for usage questions. Unresolved security vulnerabilities must be reported privately according to [SECURITY.en.md](SECURITY.en.md).

## Development Environment

- Node.js 24
- VS Code 1.125.0 or later
- npm 11 or a compatible version

After the first checkout:

```bash
npm ci
npm run compile
```

Press `F5` to start an Extension Development Host. Before submission, run:

```bash
npm run verify
npm run test:integration
npm audit --audit-level=low
```

## Change Conventions

- Extension metadata and npm scripts use `src/util/constants/BasePackage.ts` as their source of truth.
- Commands, menus, keybindings, and settings use `src/util/constants/Commands.ts` as their source of truth.
- Run `npm run compile` after changing those files so generated `package.json` and `package.nls*.json` stay aligned.
- Every user-visible runtime string requires both Chinese and English text. All `zh*` VS Code locales use Chinese; every other locale uses English. Keep stable command IDs, protocol values, persistence fields, and decision logic independent of translated labels.
- Add new behavior to the relevant `scripts/verify-*.js`; add integration coverage when VS Code lifecycle behavior is involved.
- Verify redistribution permission before adding a third-party asset and update `docs/legal/THIRD_PARTY_NOTICES.md`.
- Never commit API keys, user paths, bookmark data, build output, or local tool configuration.
- See the [release guide](../docs/release/RELEASING.en.md) for version maintenance. An ordinary pull request must not create release tags or edit an already published version.

## Commits and Pull Requests

Each commit should express one complete intent and include proportionate tests. A pull request must explain the problem, behavior change, verification commands, and any effect on settings or persistence. User-visible changes also update both README and CHANGELOG languages.
