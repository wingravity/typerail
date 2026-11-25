# TypeScript gaps

Each code names one way in which TypeScript accepts a program that can fail at runtime. Codes are stable and never reused. `typerail report` shows the code with each finding, and every page explains the gap, why TypeScript allows it, how typerail detects it and how to fix it.

Every gap has an example in [`test/gaps`](../../test/gaps) that the test suite compiles with TypeScript and runs. When a TypeScript release starts rejecting an example, the test fails and names the code, and the page is updated to say which version fixed the gap. All gaps below are open in TypeScript 6.0.3.

Gaps marked *not checked yet* are documented but not reported. They need rules that would report too much correct code today.

## typerail findings

Findings about the check itself, not gaps in TypeScript.

| Code | Gap | Priority | Checked by |
|---|---|---|---|
| [TR001](TR001.md) | File not checked | P0 | typerail |
| [TR002](TR002.md) | Inline eslint-disable comment | P4 | typerail |

## Variance and mutation

A value is reachable through a reference whose type allows writes the original type does not.

| Code | Gap | Priority | Checked by |
|---|---|---|---|
| [TR101](TR101.md) | Mutable array covariance | P1 | `typerail/no-mutable-array-widening` |
| [TR102](TR102.md) | Mutable property covariance | P1 | `typerail/no-mutable-property-widening` |
| [TR103](TR103.md) | Method parameter bivariance | P1 | `typerail/no-method-bivariance` |
| [TR104](TR104.md) | Tuple changed by an array method | P2 | `typerail/no-tuple-mutation` |
| [TR105](TR105.md) | Shallow and aliased readonly | P3 | *not checked yet* |

## Unchecked claims

The code tells the compiler a fact that nothing verifies.

| Code | Gap | Priority | Checked by |
|---|---|---|---|
| [TR201](TR201.md) | Type assertion | P1 | `@typescript-eslint/consistent-type-assertions` |
| [TR202](TR202.md) | Explicit any | P1 | `@typescript-eslint/no-explicit-any` |
| [TR203](TR203.md) | Compiler directive comment | P1 | `@typescript-eslint/ban-ts-comment` |
| [TR204](TR204.md) | Non-null assertion | P2 | `@typescript-eslint/no-non-null-assertion` |
| [TR205](TR205.md) | Definite assignment assertion | P2 | `typerail/no-definite-assignment` |
| [TR206](TR206.md) | Unchecked type predicate | P1 | `typerail/no-type-predicate` |
| [TR207](TR207.md) | Overload signature | P1 | `typerail/no-overload-signature` |
| [TR208](TR208.md) | Type argument used only for the return type | P1 | `typerail/no-return-type-argument` |
| [TR209](TR209.md) | Declaration that does not match the implementation | P1 | *not checked yet* |

## Values that are not what their type says

A value enters the program, or is copied, with a type that does not match it.

| Code | Gap | Priority | Checked by |
|---|---|---|---|
| [TR301](TR301.md) | any from an API | P1 | `@typescript-eslint/no-unsafe-assignment`, `@typescript-eslint/no-unsafe-member-access`, `@typescript-eslint/no-unsafe-call`, `@typescript-eslint/no-unsafe-argument`, `@typescript-eslint/no-unsafe-return` |
| [TR302](TR302.md) | Plain object used as a class instance | P1 | `@typescript-eslint/no-unsafe-class-instance-assignment` |
| [TR303](TR303.md) | Number used as a numeric enum | P1 | `@typescript-eslint/no-unsafe-enum-assignment` |
| [TR304](TR304.md) | Copy that drops the prototype | P1 | `@typescript-eslint/no-misused-spread`, `typerail/no-structured-clone-instance` |
| [TR305](TR305.md) | Deleted array element | P1 | `@typescript-eslint/no-array-delete` |
| [TR306](TR306.md) | Class merged with an interface | P1 | `@typescript-eslint/no-unsafe-declaration-merging` |
| [TR307](TR307.md) | const enum inlined from another package | P1 | *not checked yet* |

## Control flow

The type is right at one point and wrong at the point of use.

| Code | Gap | Priority | Checked by |
|---|---|---|---|
| [TR401](TR401.md) | Narrowing kept after a call | P2 | *not checked yet* |
| [TR402](TR402.md) | Overridden method called from a base constructor | P2 | *not checked yet* |
| [TR403](TR403.md) | Method called without its object | P2 | `@typescript-eslint/unbound-method` |
| [TR404](TR404.md) | Switch that misses a union member | P1 | `@typescript-eslint/switch-exhaustiveness-check` |

## Promises

A rejection is not handled, which stops a Node process.

| Code | Gap | Priority | Checked by |
|---|---|---|---|
| [TR501](TR501.md) | Unhandled promise | P0 | `@typescript-eslint/no-floating-promises` |
| [TR502](TR502.md) | Promise where a void result is expected | P0 | `@typescript-eslint/no-misused-promises` |

## Compiler flags

Checks that `strict` leaves out. Each code applies when the project turns the flag off.

| Code | Gap | Priority | Checked by |
|---|---|---|---|
| [TR601](TR601.md) | strict is off | P1 | `strict` in `typerail/tsconfig.json` |
| [TR602](TR602.md) | Unchecked index access | P2 | `noUncheckedIndexedAccess` in `typerail/tsconfig.json` |
| [TR603](TR603.md) | undefined stored in an optional property | P3 | `exactOptionalPropertyTypes` in `typerail/tsconfig.json` |
| [TR604](TR604.md) | Caught value treated as an Error | P2 | `useUnknownInCatchVariables` in `typerail/tsconfig.json` |
| [TR605](TR605.md) | Switch case fallthrough | P1 | `noFallthroughCasesInSwitch` in `typerail/tsconfig.json` |
| [TR606](TR606.md) | Missing side-effect import | P0 | `noUncheckedSideEffectImports` in `typerail/tsconfig.json` |
| [TR607](TR607.md) | Import with the wrong letter case | P0 | `forceConsistentCasingInFileNames` in `typerail/tsconfig.json` |

## Priorities

| Priority | Meaning |
|---|---|
| P0 | Can stop the whole process. |
| P1 | Can produce wrong data or behavior without any error being raised. |
| P2 | Can throw at runtime and fail the current request or job. |
| P3 | Does not fail on its own, but lets through a value that later code may mishandle. |
| P4 | Clarity only, or a rule from the project's own configuration. |
