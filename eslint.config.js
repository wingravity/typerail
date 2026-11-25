import tseslint from "typescript-eslint";
import { typerail } from "./src/eslint/index.ts";

const neverThrow = [
  { selector: "ThrowStatement", message: "Return err(...) from src/internal/result.ts instead of throwing." },
  { selector: "TryStatement", message: "Use attempt() or attemptAsync() from src/internal/result.ts." },
  { selector: "NewExpression[callee.name='Promise']", message: "Use attemptAsync() from src/internal/result.ts." },
  { selector: "CallExpression[callee.object.name='Promise'][callee.property.name='reject']", message: "Return err(...)." },
];

export default [
  { ignores: ["dist/**", "test/**", "eslint.config.js"] },
  ...tseslint.configs.strictTypeChecked.map((config) => ({ ...config, files: ["src/**/*.ts"] })),
  ...typerail({ tsconfigRootDir: import.meta.dirname }),
  {
    name: "repo/style",
    files: ["src/**/*.ts"],
    rules: {
      "@typescript-eslint/strict-boolean-expressions": ["error", { allowString: false, allowNumber: false, allowNullableObject: true }],
      "@typescript-eslint/no-unnecessary-condition": "error",
      eqeqeq: ["error", "always"],
      "no-restricted-syntax": ["error", ...neverThrow],
      "no-restricted-properties": [
        "error",
        { object: "JSON", property: "parse", message: "Use safeJsonParse from src/internal/json.ts." },
        { object: "JSON", property: "stringify", message: "Use safeJsonStringify from src/internal/json.ts." },
      ],
    },
  },
  {
    name: "repo/internal",
    files: ["src/internal/**"],
    rules: { "no-restricted-syntax": "off", "no-restricted-properties": "off" },
  },
];
