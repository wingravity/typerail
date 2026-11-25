# Configuration

typerail is two presets: a tsconfig with the compiler flags that close gaps, and an ESLint configuration with the rules that report the rest. Each flag and rule maps to a gap code. The [gap catalog](gaps/README.md) explains every code.

## Compiler flags

`typerail/tsconfig.json` sets only these flags. It does not set `module`, `target`, `jsx`, `lib` or `types`.

| Flag | Code |
|---|---|
| `strict` | [TR601](gaps/TR601.md) |
| `noUncheckedIndexedAccess` | [TR602](gaps/TR602.md) |
| `exactOptionalPropertyTypes` | [TR603](gaps/TR603.md) |
| `useUnknownInCatchVariables` | [TR604](gaps/TR604.md) |
| `noFallthroughCasesInSwitch` | [TR605](gaps/TR605.md) |
| `noUncheckedSideEffectImports` | [TR606](gaps/TR606.md) |
| `forceConsistentCasingInFileNames` | [TR607](gaps/TR607.md) |

A project's own `compilerOptions` override inherited ones. `typerail report` lists every flag the project turns off.

## ESLint rules

| Rule | Code |
|---|---|
| `typerail/no-mutable-array-widening` | [TR101](gaps/TR101.md) |
| `typerail/no-mutable-property-widening` | [TR102](gaps/TR102.md) |
| `typerail/no-method-bivariance` | [TR103](gaps/TR103.md) |
| `typerail/no-tuple-mutation` | [TR104](gaps/TR104.md) |
| `@typescript-eslint/consistent-type-assertions` | [TR201](gaps/TR201.md) |
| `@typescript-eslint/no-explicit-any` | [TR202](gaps/TR202.md) |
| `@typescript-eslint/ban-ts-comment` | [TR203](gaps/TR203.md) |
| `@typescript-eslint/no-non-null-assertion` | [TR204](gaps/TR204.md) |
| `typerail/no-definite-assignment` | [TR205](gaps/TR205.md) |
| `typerail/no-type-predicate` | [TR206](gaps/TR206.md) |
| `typerail/no-overload-signature` | [TR207](gaps/TR207.md) |
| `typerail/no-return-type-argument` | [TR208](gaps/TR208.md) |
| `@typescript-eslint/no-unsafe-assignment`, `no-unsafe-member-access`, `no-unsafe-call`, `no-unsafe-argument`, `no-unsafe-return` | [TR301](gaps/TR301.md) |
| `@typescript-eslint/no-unsafe-class-instance-assignment` (typescript-eslint 8.73 and later) | [TR302](gaps/TR302.md) |
| `@typescript-eslint/no-unsafe-enum-assignment` (typescript-eslint 8.71 and later) | [TR303](gaps/TR303.md) |
| `@typescript-eslint/no-misused-spread`, `typerail/no-structured-clone-instance` | [TR304](gaps/TR304.md) |
| `@typescript-eslint/no-array-delete` | [TR305](gaps/TR305.md) |
| `@typescript-eslint/no-unsafe-declaration-merging` | [TR306](gaps/TR306.md) |
| `@typescript-eslint/unbound-method` | [TR403](gaps/TR403.md) |
| `@typescript-eslint/switch-exhaustiveness-check` | [TR404](gaps/TR404.md) |
| `@typescript-eslint/no-floating-promises` | [TR501](gaps/TR501.md) |
| `@typescript-eslint/no-misused-promises` | [TR502](gaps/TR502.md) |

The two rules marked with a typescript-eslint version are enabled only when the installed version has them.

`// eslint-disable` comments have no effect ([TR002](gaps/TR002.md)), so a finding cannot be hidden in the source. A deliberate exception belongs in `eslint.config.js`, where `typerail report` lists it.

## Tests

In files matching the `tests` option, these rules are off, because mocks and fixtures often need them: type assertions, non-null assertions, definite assignment assertions, type predicates, return-only type arguments and the `no-unsafe-*` rules. The variance rules and the promise rules stay on: an assertion that is not awaited passes silently.

## Options

```js
typerail({
  tsconfigRootDir: import.meta.dirname,
  tests: ["**/*.test.ts", "**/*.spec.ts", "**/__tests__/**"],
  files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
  allowInlineDisable: false,
});
```

| Option | Purpose |
|---|---|
| `tsconfigRootDir` | the directory of the tsconfig used for type information |
| `tests` | test files, where the rules listed above are off |
| `files` | files the rules apply to |
| `allowInlineDisable` | `true` makes `// eslint-disable` comments work again |
