# Instructions for coding agents

This file is for work on typerail itself. Projects that use typerail get their own instructions from `typerail init`, and their reference is `docs/gaps/README.md`.

## Purpose

typerail reports code that TypeScript accepts but that can fail at runtime. A rule or compiler flag belongs in the published configuration only if it passes that test. Style choices, such as throwing versus returning errors, loop forms or equality operators, do not.

## Before a change is complete

```sh
npm run typecheck
npm run lint
npm test
```

All three must pass. `eslint.config.js` applies the typerail preset to `src/`, plus stricter rules for this repository only:

- Functions that can fail return a `Result` from `src/internal/result.ts`. Do not throw. Only `src/internal/` may call throwing APIs. This is the style of this repository, not something typerail enforces on its users.
- No `as` (except `as const`), `!`, `any` or `@ts-` comments.
- `// eslint-disable` comments have no effect. Do not add them, and do not weaken `eslint.config.js` or the tsconfig files.

## Conventions

- No code comments, except for logic that cannot be understood from the code itself.
- Do not add runtime dependencies. typerail is a dev dependency of the projects that use it.
- Tests use `node:test`. Do not add a test framework.
- Documentation uses a formal, factual tone and no em or en dashes.

## Rules and configuration

- A change to the ESLint configuration or the tsconfig needs matching lines in `test/fixtures/project`, each marked `// @expect <rule>`. The test fails on a missing or an extra finding.
- Every rule the configuration enables needs a priority, a reason and a fix hint in `src/cli/report/classify.ts`.
- Custom rules in `src/eslint/rules/` need valid and invalid cases in `test/rules.test.ts`.
- When behavior or options change, update `README.md` and `docs/configuration.md`.

## Gap codes

- Every gap has a code in `src/gaps.ts`, a page in `docs/gaps/` listed in `docs/gaps/README.md`, and, unless it is a TR0xx finding, a proof in `test/gaps/` that TypeScript accepts and that fails when run. The page shows the proof unchanged. `test/gaps.test.ts` enforces all of this.
- Codes are stable. Never renumber or reuse one. A gap that TypeScript fixes keeps its code and gets `fixedIn` in `src/gaps.ts`.
- Every rule message starts with its code in brackets, for example `[TR101]`, and the rule's `docs.url` points to the code's page.

See `CONTRIBUTING.md` for details.
