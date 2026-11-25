# Contributing

## Development

```sh
npm install
npm run typecheck
npm run lint
npm test
npm run build
```

typerail lints its own source with its own preset, plus rules for this repository only: the source returns Results instead of throwing, and `src/internal/` holds the only code allowed to call throwing APIs.

## Rules and configuration

Every rule and compiler flag is covered by `test/fixtures/project`, a project of intentionally incorrect code. Each line that must be reported ends with a marker:

```ts
const animals: Animal[] = dogs; // @expect typerail/no-mutable-array-widening
```

The test fails when a marked finding is missing or an unmarked finding appears. A change to the configuration needs matching fixture lines. `style.ts` holds code that must not be reported, such as `throw`, `while` and `==`.

Every rule the configuration enables needs a priority, a reason and a fix hint in `src/cli/report/classify.ts`. A test fails when one is missing.

Custom rules in `src/eslint/rules/` are tested with `RuleTester` in `test/rules.test.ts`, with valid and invalid cases.

## Gap codes

A new gap needs four things, and `test/gaps.test.ts` fails until all of them exist:

1. An entry in `src/gaps.ts` with the next free code in its category. Codes are never renumbered or reused.
2. A proof in `test/gaps/<code>.ts` that exports `proof()`. TypeScript must accept it under `config/tsconfig.json`, and running it must throw, or return `{ expected, actual }` with different values. For a compiler flag, TypeScript must accept it with the flag off and reject it with the flag on.
3. A page in `docs/gaps/<code>.md` that shows the proof unchanged, and a row in `docs/gaps/README.md`.
4. A rule, a flag or the words "Not checked yet" on the page.

When a TypeScript release rejects a proof, the gap is fixed in that release. Set `fixedIn` on the entry and update the page; the code stays.

## Scope

typerail reports code that TypeScript accepts but that can fail at runtime. A new rule needs a fixture that type-checks under `config/tsconfig.json` and fails when it runs. Style, formatting, error-handling style and maintainability rules are out of scope.

## Pull requests

Keep changes focused. Code comments are reserved for logic that cannot be understood from the code itself.

## Releases

typerail is published to npm as `@wingravity/typerail` by the **Release** workflow, using npm trusted publishing: GitHub Actions proves its identity to npm, so no npm token is stored anywhere.

1. Set the version in `package.json` and run `npm install --package-lock-only`.
2. Commit, then tag the commit `v<version>` and push the tag: `git tag v0.2.0 && git push origin main v0.2.0`.
3. When the workflow finishes, approve the release on npmjs.com under **Staged Packages**, with two-factor authentication. Until then, nothing is published.

The workflow checks that the tag matches `package.json`, then runs `npm stage publish`. `prepublishOnly` runs the type check, lint, tests and build first, so a failing check stops the release and `dist/` is always built from the tagged source. The trusted publisher on npm is allowed to stage only, so a release always needs a maintainer's approval.
