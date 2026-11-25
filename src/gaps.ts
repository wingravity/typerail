export type Priority = 0 | 1 | 2 | 3 | 4;

export type ProofOutcome = "throws" | "wrong-value" | "compile-only" | "none";

export interface Gap {
  readonly code: string;
  readonly title: string;
  readonly priority: Priority;
  readonly why: string;
  readonly fix: string;
  readonly rules: readonly string[];
  readonly flag?: string;
  readonly proof: ProofOutcome;
  readonly fixedIn?: string;
}

export const DOCS_BASE = "https://github.com/wingravity/typerail/blob/main/docs/gaps";

export function docsUrl(code: string): string {
  return `${DOCS_BASE}/${code}.md`;
}

export const GAPS: readonly Gap[] = [
  {
    code: "TR001",
    title: "File not checked",
    priority: 0,
    why: "The file could not be parsed or type-checked, so none of its code is checked.",
    fix: "Fix the parse error, or include the file in the tsconfig used by ESLint.",
    rules: [],
    proof: "none",
  },
  {
    code: "TR002",
    title: "Inline eslint-disable comment",
    priority: 4,
    why: "Inline `eslint-disable` comments have no effect under typerail.",
    fix: "Remove the comment. Put a deliberate exception in eslint.config.js instead.",
    rules: [],
    proof: "none",
  },
  {
    code: "TR101",
    title: "Mutable array covariance",
    priority: 1,
    why: "A mutable array is used as a mutable array of a wider type, so code holding it can add an element of the wrong type to the original array.",
    fix: "Type the target as a readonly array, such as `readonly Animal[]`, or pass a copy with `[...items]`.",
    rules: ["typerail/no-mutable-array-widening"],
    proof: "throws",
  },
  {
    code: "TR102",
    title: "Mutable property covariance",
    priority: 1,
    why: "An object is used where its properties have wider types and can be written, so code holding it can store a value of the wrong type in the original object.",
    fix: "Make the target's properties readonly, pass a copy, or declare the type parameter invariant (`interface Box<in out T>`).",
    rules: ["typerail/no-mutable-property-widening"],
    proof: "throws",
  },
  {
    code: "TR103",
    title: "Method parameter bivariance",
    priority: 1,
    why: "A method that accepts a narrow parameter is used where a wider parameter is expected. TypeScript checks method parameters in both directions, so the method can be called with a value it cannot handle.",
    fix: "Declare the member as a function property (`handle: (value: T) => void`), declare the type parameter invariant (`in out T`), or do not widen the object.",
    rules: ["typerail/no-method-bivariance"],
    proof: "throws",
  },
  {
    code: "TR104",
    title: "Tuple changed by an array method",
    priority: 2,
    why: "A method such as `pop` or `push` changes the tuple's length or order, but its type still describes the original positions.",
    fix: "Build a new tuple instead of mutating it, or type the value as a readonly tuple or an array.",
    rules: ["typerail/no-tuple-mutation"],
    proof: "throws",
  },
  {
    code: "TR105",
    title: "Shallow and aliased readonly",
    priority: 3,
    why: "`readonly` prevents writes through one reference only. Nested objects and other references to the same value can still change it.",
    fix: "Copy or freeze values at ownership boundaries, and make nested types readonly too.",
    rules: [],
    proof: "throws",
  },
  {
    code: "TR201",
    title: "Type assertion",
    priority: 1,
    why: "`as` tells the compiler to trust a type without checking the value.",
    fix: "Narrow the value with checks (`typeof`, `in`, `Array.isArray`) or validate it with a schema.",
    rules: ["@typescript-eslint/consistent-type-assertions"],
    proof: "throws",
  },
  {
    code: "TR202",
    title: "Explicit any",
    priority: 1,
    why: "`any` switches type checking off for the value and everything it touches.",
    fix: "Use `unknown` and narrow it, or write the real type.",
    rules: ["@typescript-eslint/no-explicit-any"],
    proof: "throws",
  },
  {
    code: "TR203",
    title: "Compiler directive comment",
    priority: 1,
    why: "`@ts-ignore`, `@ts-expect-error` and `@ts-nocheck` hide type errors without fixing them.",
    fix: "Fix the type error the comment hides.",
    rules: ["@typescript-eslint/ban-ts-comment"],
    proof: "throws",
  },
  {
    code: "TR204",
    title: "Non-null assertion",
    priority: 2,
    why: "`value!` claims the value is not null or undefined. If it is, the next access throws.",
    fix: "Check for null or undefined explicitly instead of asserting.",
    rules: ["@typescript-eslint/no-non-null-assertion"],
    proof: "throws",
  },
  {
    code: "TR205",
    title: "Definite assignment assertion",
    priority: 2,
    why: "`field!: T` claims the field is assigned before use. If it is not, reading it returns undefined.",
    fix: "Initialize the field in the constructor, or type it as `T | undefined` and check it.",
    rules: ["typerail/no-definite-assignment"],
    proof: "throws",
  },
  {
    code: "TR206",
    title: "Unchecked type predicate",
    priority: 1,
    why: "A type predicate (`value is T`) or assertion function (`asserts value is T`) is trusted without checking that its body proves the claim.",
    fix: "Validate with a schema library, or remove the annotation and let TypeScript infer the predicate from the body (TypeScript 5.5 and later).",
    rules: ["typerail/no-type-predicate"],
    proof: "throws",
  },
  {
    code: "TR207",
    title: "Overload signature",
    priority: 1,
    why: "Overload signatures are checked only loosely against the implementation, so callers can be promised a return type the implementation never produces.",
    fix: "Use one signature with a union or a conditional return type, or split the function into separate functions.",
    rules: ["typerail/no-overload-signature"],
    proof: "throws",
  },
  {
    code: "TR208",
    title: "Type argument used only for the return type",
    priority: 1,
    why: "The type argument does not appear in any parameter, so it only tells the compiler what the result is. It is a type assertion in disguise.",
    fix: "Leave the type argument out and validate the result, or check it with `instanceof`.",
    rules: ["typerail/no-return-type-argument"],
    proof: "throws",
  },
  {
    code: "TR209",
    title: "Declaration that does not match the implementation",
    priority: 1,
    why: "A `.d.ts` file or `declare` statement describes JavaScript that the compiler never checks, so it can promise values the code does not return.",
    fix: "Test the declarations against the implementation, keep type packages in step with the runtime package, and validate values from untrusted modules.",
    rules: [],
    proof: "throws",
  },
  {
    code: "TR301",
    title: "any from an API",
    priority: 1,
    why: "`JSON.parse`, `response.json()` and untyped libraries return `any`, which switches checking off without anyone writing it.",
    fix: "Assign the value to `unknown`, then narrow or validate it.",
    rules: [
      "@typescript-eslint/no-unsafe-assignment",
      "@typescript-eslint/no-unsafe-member-access",
      "@typescript-eslint/no-unsafe-call",
      "@typescript-eslint/no-unsafe-argument",
      "@typescript-eslint/no-unsafe-return",
    ],
    proof: "throws",
  },
  {
    code: "TR302",
    title: "Plain object used as a class instance",
    priority: 1,
    why: "A plain object with the right shape is accepted as a class instance, but `instanceof` is false for it, so narrowing sends it down the wrong branch.",
    fix: "Create the value with `new`, or type the location as an interface instead of the class.",
    rules: ["@typescript-eslint/no-unsafe-class-instance-assignment"],
    proof: "throws",
  },
  {
    code: "TR303",
    title: "Number used as a numeric enum",
    priority: 1,
    why: "Any `number` is accepted as a numeric enum value, so a value outside the enum reaches code that handles only its members.",
    fix: "Check the number against the enum's members before using it, or use a string literal union.",
    rules: ["@typescript-eslint/no-unsafe-enum-assignment"],
    proof: "throws",
  },
  {
    code: "TR304",
    title: "Copy that drops the prototype",
    priority: 1,
    why: "Spreading or structured-cloning a class instance copies its own properties only, but the result is typed as if it kept its methods.",
    fix: "Copy class instances with a method or constructor, and spread or clone only plain objects.",
    rules: ["@typescript-eslint/no-misused-spread", "typerail/no-structured-clone-instance"],
    proof: "throws",
  },
  {
    code: "TR305",
    title: "Deleted array element",
    priority: 1,
    why: "`delete` on an array element leaves a hole that reads as undefined while the type still says it holds an element.",
    fix: "Use `splice` or `filter` to remove the element.",
    rules: ["@typescript-eslint/no-array-delete"],
    proof: "throws",
  },
  {
    code: "TR306",
    title: "Class merged with an interface",
    priority: 1,
    why: "An interface and a class with the same name merge, so the class appears to have members it never initializes.",
    fix: "Rename one of them, or declare the members on the class itself.",
    rules: ["@typescript-eslint/no-unsafe-declaration-merging"],
    proof: "throws",
  },
  {
    code: "TR307",
    title: "const enum inlined from another package",
    priority: 1,
    why: "Values of an ambient `const enum` are copied into the compiled code, so they go stale when the package that declares the enum is upgraded without recompiling.",
    fix: "Do not use `const enum` across package boundaries. Use a regular enum or a union of literals.",
    rules: [],
    proof: "throws",
  },
  {
    code: "TR401",
    title: "Narrowing kept after a call",
    priority: 2,
    why: "TypeScript keeps a property's narrowed type after a function call, even when the call changes the property.",
    fix: "Copy the narrowed value into a local constant before the call, and use the constant afterwards.",
    rules: [],
    proof: "throws",
  },
  {
    code: "TR402",
    title: "Overridden method called from a base constructor",
    priority: 2,
    why: "A base class constructor calls a method that a subclass overrides. The override runs before the subclass's fields are initialized.",
    fix: "Do not call overridable methods from a constructor. Initialize in the subclass, or use a factory function.",
    rules: [],
    proof: "throws",
  },
  {
    code: "TR403",
    title: "Method called without its object",
    priority: 2,
    why: "The method is detached from its object, so `this` is undefined when it runs and the call throws.",
    fix: "Call it on the object, bind it (`obj.method.bind(obj)`), or use an arrow function.",
    rules: ["@typescript-eslint/unbound-method"],
    proof: "throws",
  },
  {
    code: "TR404",
    title: "Switch that misses a union member",
    priority: 1,
    why: "A case of the union is not handled, so it falls through to the code after the switch.",
    fix: "Add a case for every member of the union. `default` does not count.",
    rules: ["@typescript-eslint/switch-exhaustiveness-check"],
    proof: "wrong-value",
  },
  {
    code: "TR501",
    title: "Unhandled promise",
    priority: 0,
    why: "A rejected promise that nothing handles becomes an unhandled rejection, which stops a Node process.",
    fix: "Await or return the promise, or handle its rejection with `.catch`.",
    rules: ["@typescript-eslint/no-floating-promises"],
    proof: "throws",
  },
  {
    code: "TR502",
    title: "Promise where a void result is expected",
    priority: 0,
    why: "An async function is passed where the caller ignores the result, so its rejection is never handled.",
    fix: "Use a loop with `await`, or handle the rejection inside the callback.",
    rules: ["@typescript-eslint/no-misused-promises"],
    proof: "throws",
  },
  {
    code: "TR601",
    title: "strict is off",
    priority: 1,
    why: "Without `strict`, `null` and `undefined` are accepted everywhere and many other checks are off.",
    fix: "Enable `strict` and fix the errors it reports.",
    rules: [],
    flag: "strict",
    proof: "throws",
  },
  {
    code: "TR602",
    title: "Unchecked index access",
    priority: 2,
    why: "Without `noUncheckedIndexedAccess`, `items[0]` is typed as an element even when the array is empty.",
    fix: "Enable `noUncheckedIndexedAccess` and check indexed values for undefined.",
    rules: [],
    flag: "noUncheckedIndexedAccess",
    proof: "throws",
  },
  {
    code: "TR603",
    title: "undefined stored in an optional property",
    priority: 3,
    why: "Without `exactOptionalPropertyTypes`, `{ timeout: undefined }` is accepted for `timeout?: number`, and spreading it overwrites a default with undefined.",
    fix: "Enable `exactOptionalPropertyTypes`, and leave optional properties out instead of setting them to undefined.",
    rules: [],
    flag: "exactOptionalPropertyTypes",
    proof: "throws",
  },
  {
    code: "TR604",
    title: "Caught value treated as an Error",
    priority: 2,
    why: "Without `useUnknownInCatchVariables`, a caught value is `any`, although code can throw strings and other values.",
    fix: "Enable `useUnknownInCatchVariables` and narrow caught values, for example with `instanceof Error`.",
    rules: [],
    flag: "useUnknownInCatchVariables",
    proof: "throws",
  },
  {
    code: "TR605",
    title: "Switch case fallthrough",
    priority: 1,
    why: "Without `noFallthroughCasesInSwitch`, a case that does not end with `break` or `return` runs into the next one.",
    fix: "Enable `noFallthroughCasesInSwitch` and end every case.",
    rules: [],
    flag: "noFallthroughCasesInSwitch",
    proof: "wrong-value",
  },
  {
    code: "TR606",
    title: "Missing side-effect import",
    priority: 0,
    why: "Without `noUncheckedSideEffectImports`, `import \"./polyfill\"` compiles even when the file does not exist, and loading the module fails.",
    fix: "Enable `noUncheckedSideEffectImports` and fix the import path.",
    rules: [],
    flag: "noUncheckedSideEffectImports",
    proof: "throws",
  },
  {
    code: "TR607",
    title: "Import with the wrong letter case",
    priority: 0,
    why: "Without `forceConsistentCasingInFileNames`, an import that differs from the file name only in letter case compiles on macOS and Windows and fails on Linux.",
    fix: "Enable `forceConsistentCasingInFileNames` and match the file name exactly.",
    rules: [],
    flag: "forceConsistentCasingInFileNames",
    proof: "compile-only",
  },
];

const BY_CODE = new Map(GAPS.map((gap) => [gap.code, gap]));
const BY_RULE = new Map(GAPS.flatMap((gap) => gap.rules.map((rule) => [rule, gap] as const)));
const BY_FLAG = new Map(GAPS.flatMap((gap) => (gap.flag === undefined ? [] : [[gap.flag, gap] as const])));

export function gapByCode(code: string): Gap | undefined {
  return BY_CODE.get(code);
}

export function gapForRule(rule: string): Gap | undefined {
  return BY_RULE.get(rule);
}

export function gapForFlag(flag: string): Gap | undefined {
  return BY_FLAG.get(flag);
}

export function isChecked(gap: Gap): boolean {
  return gap.rules.length > 0 || gap.flag !== undefined || gap.code.startsWith("TR0");
}
