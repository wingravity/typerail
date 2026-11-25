import tseslint from "typescript-eslint";
import type { FlatConfig } from "typescript-eslint";
import { plugin } from "./plugin.ts";

export interface TyperailOptions {
  readonly files?: readonly string[] | undefined;
  readonly tests?: readonly string[] | undefined;
  readonly allowInlineDisable?: boolean | undefined;
  readonly tsconfigRootDir?: string | undefined;
}

export const DEFAULT_FILES = ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"];
export const DEFAULT_TESTS = ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts", "**/*.spec.tsx", "**/__tests__/**"];

const NODE_TEST_FUNCTIONS = ["describe", "suite", "it", "test", "before", "after", "beforeEach", "afterEach"];

export const ESCAPE_HATCH_RULES: FlatConfig.Rules = {
  "@typescript-eslint/consistent-type-assertions": ["error", { assertionStyle: "never" }],
  "@typescript-eslint/no-non-null-assertion": "error",
  "@typescript-eslint/no-explicit-any": "error",
  "@typescript-eslint/ban-ts-comment": [
    "error",
    { "ts-expect-error": true, "ts-ignore": true, "ts-nocheck": true, "ts-check": false },
  ],
};

export const UNSAFE_ANY_RULES: FlatConfig.Rules = {
  "@typescript-eslint/no-unsafe-assignment": "error",
  "@typescript-eslint/no-unsafe-member-access": "error",
  "@typescript-eslint/no-unsafe-call": "error",
  "@typescript-eslint/no-unsafe-argument": "error",
  "@typescript-eslint/no-unsafe-return": "error",
};

export const CLAIM_RULES: FlatConfig.Rules = {
  "typerail/no-definite-assignment": "error",
  "typerail/no-type-predicate": "error",
  "typerail/no-overload-signature": "error",
  "typerail/no-return-type-argument": "error",
};

export const VARIANCE_RULES: FlatConfig.Rules = {
  "typerail/no-mutable-array-widening": "error",
  "typerail/no-mutable-property-widening": "error",
  "typerail/no-method-bivariance": "error",
  "typerail/no-tuple-mutation": "error",
};

const NEWER_TYPESCRIPT_ESLINT_RULES = ["no-unsafe-enum-assignment", "no-unsafe-class-instance-assignment"];

function availableNewerRules(): FlatConfig.Rules {
  const rules: unknown = "rules" in tseslint.plugin ? tseslint.plugin.rules : undefined;
  const available = typeof rules === "object" && rules !== null ? rules : {};
  return Object.fromEntries(
    NEWER_TYPESCRIPT_ESLINT_RULES.filter((name) => name in available).map((name) => [`@typescript-eslint/${name}`, "error"]),
  );
}

export const RUNTIME_HOLE_RULES: FlatConfig.Rules = {
  "@typescript-eslint/no-floating-promises": [
    "error",
    {
      checkThenables: true,
      allowForKnownSafeCalls: [{ from: "package", package: "node:test", name: [...NODE_TEST_FUNCTIONS] }],
    },
  ],
  "@typescript-eslint/no-misused-promises": "error",
  "@typescript-eslint/switch-exhaustiveness-check": [
    "error",
    { considerDefaultExhaustiveForUnions: false, requireDefaultForNonUnion: true },
  ],
  "@typescript-eslint/unbound-method": "error",
  "@typescript-eslint/no-misused-spread": "error",
  "@typescript-eslint/no-array-delete": "error",
  "@typescript-eslint/no-unsafe-declaration-merging": "error",
  "typerail/no-structured-clone-instance": "error",
};

const RELAXED_IN_TESTS = [
  "@typescript-eslint/consistent-type-assertions",
  "@typescript-eslint/no-non-null-assertion",
  "typerail/no-definite-assignment",
  "typerail/no-type-predicate",
  "typerail/no-return-type-argument",
  ...Object.keys(UNSAFE_ANY_RULES),
];

export function typerail(options: TyperailOptions = {}): FlatConfig.Config[] {
  const files: (string | string[])[] = [...(options.files ?? DEFAULT_FILES)];
  const tests: (string | string[])[] = [...(options.tests ?? DEFAULT_TESTS)];

  return [
    {
      name: "typerail/linter-options",
      linterOptions: {
        noInlineConfig: options.allowInlineDisable !== true,
        reportUnusedDisableDirectives: "error",
      },
    },
    { ...tseslint.configs.base, name: "typerail/parser", files },
    {
      name: "typerail/rules",
      files,
      plugins: { typerail: plugin },
      languageOptions: {
        parserOptions: {
          projectService: true,
          ...(options.tsconfigRootDir === undefined ? {} : { tsconfigRootDir: options.tsconfigRootDir }),
        },
      },
      rules: {
        ...ESCAPE_HATCH_RULES,
        ...CLAIM_RULES,
        ...UNSAFE_ANY_RULES,
        ...VARIANCE_RULES,
        ...RUNTIME_HOLE_RULES,
        ...availableNewerRules(),
      },
    },
    {
      name: "typerail/tests",
      files: tests,
      rules: Object.fromEntries(RELAXED_IN_TESTS.map((rule) => [rule, "off"])),
    },
  ];
}

export default typerail;
