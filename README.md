# typerail

Finds TypeScript code that type-checks and still fails at runtime.

With `strict`, `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` all on, TypeScript accepts this code without a cast, an `any` or an assertion:

```ts
const dogs: Dog[] = [rex];
const animals: Animal[] = dogs; // typerail TR101: this Dog[] is used as a mutable Animal[]
animals.push({ name: "Tom" });
const d = dogs[1];
if (d) d.bark(); // TypeError: d.bark is not a function
```

Arrays are covariant in TypeScript, so a `Dog[]` can be used as an `Animal[]`, and a plain `Animal` ends up inside it. The type system has a number of gaps like this one. typerail catalogs them, gives each a code, and reports them.

- **Gaps in the type system.** Writable properties and arrays used at a wider type, method parameters checked in both directions, tuples changed by array methods, unhandled promises, and the compiler flags that close the gaps `strict` leaves open.
- **Unchecked claims.** `as`, `any`, `!`, `@ts-ignore`, hand-written type predicates, overload signatures and `get<User>(url)`-style type arguments tell the compiler facts that nothing verifies. `any` from `JSON.parse` or untyped libraries does the same without anyone writing it.
- **No way around it.** `// eslint-disable` comments have no effect, and `typerail report` lists every rule or compiler flag that the project's configuration weakens.
- **Ranked by consequence.** `typerail report` orders findings from "can stop the process" to "no runtime effect", with a fix instruction for each.

typerail does not check style. Throwing or returning errors, loop forms, equality operators and truthiness checks are left to the project's own configuration, which typerail is added to rather than replacing.

<p align="center"><img src=".github/assets/report.png" alt="Output of npx typerail report --next 4: findings grouped from P0 to P4, each with a file location, the rule and a fix instruction" width="820"></p>

## Gap codes

Every gap has a code, such as TR101 for mutable array covariance, and a page that explains it: an example, why TypeScript allows it, how typerail detects it and how to fix it. [The catalog](docs/gaps/README.md) lists 36 codes, including gaps typerail documents but cannot check yet.

Each example is a test. The test suite compiles every example with TypeScript and runs it, so the catalog stays true: when a TypeScript release fixes a gap, the test names the code.

```text
1. [P1] TR102 src/cart.ts:41:12 typerail/no-mutable-property-widening
   [TR102] Property `value` is Dog here but writable as Animal through this reference ...
   Fix: Make the target's properties readonly, pass a copy, or declare the type parameter invariant (`interface Box<in out T>`).
   Docs: https://github.com/wingravity/typerail/blob/main/docs/gaps/TR102.md
```

## Quick start

```sh
npx @wingravity/typerail init
npm install
npx typerail report --next 20
```

`init` adds the configuration and the agent instructions to the project. `report` lists what needs attention, most dangerous first. `npm run check` runs the compiler and ESLint and fails on any finding; use it in CI.

## Coding agents

Coding agents such as Claude Code, Codex, Copilot and Cursor write code that compiles and passes review, and when a check fails, they often make it pass by weakening it. typerail is built for that:

- `// eslint-disable` comments have no effect, and a weakened rule or compiler flag shows up in the report.
- `init` adds a typerail section to `AGENTS.md`, the instruction file these agents read. It names the banned escape hatches, the fixes, and the requirement that `npm run check` passes.
- `npx typerail report --next 20` is a short, prioritized work queue with a fix instruction for each finding. `--format json` gives the same data in a stable shape.

The `AGENTS.md` section sits between `<!-- typerail:start -->` and `<!-- typerail:end -->`, and running `init` again refreshes it without touching the rest of the file. Claude Code reads `AGENTS.md` unless the project has a `CLAUDE.md`, so `init` adds an `@AGENTS.md` import to an existing `CLAUDE.md`.

## Report

`typerail report` runs the TypeScript compiler and ESLint together and orders every finding by the worst realistic runtime consequence of its rule.

| Priority | Meaning | Examples |
|---|---|---|
| P0: Process can go down | can stop the whole process | floating promises, async callbacks where a void callback is expected, imports that fail on Linux |
| P1: Silent wrong result | wrong data or behavior with no error raised | `as`, `any`, `Dog[]` used as a mutable `Animal[]`, bivariant methods, type predicates, non-exhaustive switches |
| P2: Request fails | throws at runtime and fails one request | possibly undefined access, `!`, `field!: T`, tuples changed by `pop`, detached methods |
| P3: Latent risk | lets through a value that later code may mishandle | `undefined` passed for an optional property |
| P4: No runtime effect | clarity only | rules from the project's own configuration |

```sh
npx typerail report                 # writes typerail-report.md
npx typerail report --next 20       # the 20 highest-priority findings, with fix instructions
npx typerail report --format json   # all findings as JSON
```

Production code is listed before tests. The report also lists the files with the most P0 to P2 findings and any typerail rule or compiler flag that the project's configuration turns off or downgrades.

<details>
<summary><b>Report options</b></summary>

- `--project <tsconfig>` selects the tsconfig.
- The report includes findings recorded in `eslint-suppressions.json`. `--respect-suppressions` leaves them out (requires ESLint 10.1 or later).
- The command always exits with code 0. Use `npm run check` as the CI gate.
- Add `typerail-report.md` to `.gitignore` if it should not be committed.

</details>

## Setup

Requires Node 20.3 or later, TypeScript 5.8 to 6.0, ESLint 9.35 or later (or ESLint 10) and typescript-eslint 8.30 or later.

<details>
<summary><b>What <code>init</code> changes</b></summary>

| File | Change |
|---|---|
| `tsconfig.json` | adds `@wingravity/typerail/tsconfig.json` to `extends` (comments and formatting are kept) |
| `eslint.config.js` | creates it, or prints the lines to add if one exists |
| `package.json` | adds a `check` script and `@wingravity/typerail` as a dev dependency |
| `AGENTS.md` | adds a typerail section with instructions for coding agents, or creates the file |
| `CLAUDE.md` | if it exists, adds `@AGENTS.md` so Claude Code also reads those instructions; never created |
| `.vscode/extensions.json` | recommends the ESLint extension |
| `.vscode/settings.json` | uses the project's TypeScript version and, with ESLint 10.1 or later, applies bulk suppressions in the editor |

It also prints the install command for any missing peer dependency (`typescript`, `eslint`, `typescript-eslint`). Running it again changes nothing.

- `--dry-run` previews the changes without writing.
- `--force` overwrites an existing ESLint config.
- `npx @wingravity/typerail@0.1.0 init` runs a specific release.

</details>

<details>
<summary><b>Adopting on an existing codebase</b></summary>

1. Run `init`.
2. Run `npx eslint . --suppress-all` and commit `eslint-suppressions.json`. New code must be clean; shrink the file as you fix code with `npx eslint . --prune-suppressions`.
3. Run `npx typerail report` to see which findings to fix first.
4. Fix the TypeScript errors. Bulk suppressions only cover ESLint. Most fixes are mechanical: handle the `undefined` from index access, and leave optional properties out instead of passing `undefined`.

`init` sets `"eslint.options": { "applySuppressions": true }` in `.vscode/settings.json` so the VS Code ESLint extension hides suppressed findings the same way CI does.

</details>

<details>
<summary><b>Manual setup</b></summary>

```sh
npm install -D @wingravity/typerail typescript eslint typescript-eslint
```

```jsonc
// tsconfig.json
{
  "extends": ["<your framework or base config>", "@wingravity/typerail/tsconfig.json"],
  "compilerOptions": { /* module, target, jsx... as before */ }
}
```

```js
// eslint.config.js
import typerail from "@wingravity/typerail/eslint";

export default [
  { ignores: ["dist/**"] },
  // ...your existing configuration
  ...typerail({ tsconfigRootDir: import.meta.dirname }),
];
```

```jsonc
// package.json
"scripts": { "check": "tsc --noEmit && eslint ." }
```

</details>

<details>
<summary><b>Continuous integration</b></summary>

`npm run check` exits with a non-zero code on any finding. For GitHub Actions, add `.github/workflows/check.yml`:

```yaml
name: Check

on:
  pull_request:
  push:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run check
```

To block merging on failures, mark the **Check** job as required in the branch protection rules. For pnpm, Yarn or Bun, replace the install and run commands.

</details>

## Reference

- [docs/gaps](docs/gaps/README.md): every gap code, with an example and a fix.
- [docs/configuration.md](docs/configuration.md): which flag or rule reports each code, the options, and the rules relaxed in test files.

Found code that TypeScript accepts and that fails at runtime, and typerail does not report it? [Open a missing check issue](https://github.com/wingravity/typerail/issues/new?template=missing-check.yml).

See [CONTRIBUTING.md](CONTRIBUTING.md) for development and releases.

## License

MIT
