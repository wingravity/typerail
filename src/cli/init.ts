import { join } from "node:path";
import { err, ok, type AsyncResult, type Result } from "../internal/result.ts";
import { safeJsonParse, safeJsonStringify } from "../internal/json.ts";
import { ensureDir, readTextFile, writeTextFile, type FsError } from "../internal/fs.ts";
import { asArray, asRecord, parseJsonc, setTopLevelProperty } from "./jsonc.ts";
import { SUPPRESSIONS_API_VERSION, supportsSuppressionsApi } from "./eslint-version.ts";

export const TSCONFIG_ENTRY = "typerail/tsconfig.json";
export const ESLINT_EXTENSION = "dbaeumer.vscode-eslint";
export const CHECK_SCRIPT = "tsc --noEmit && eslint .";
const PEERS = ["typescript", "eslint", "typescript-eslint"];
const ESLINT_CONFIG_NAMES = [
  "eslint.config.js",
  "eslint.config.mjs",
  "eslint.config.cjs",
  "eslint.config.ts",
  "eslint.config.mts",
  "eslint.config.cts",
];

export interface InitOptions {
  readonly cwd: string;
  readonly packageSpec: string;
  readonly dryRun?: boolean | undefined;
  readonly force?: boolean | undefined;
}

export type ChangeStatus = "created" | "updated" | "unchanged" | "skipped";

export interface Change {
  readonly file: string;
  readonly status: ChangeStatus;
  readonly detail: string;
  readonly content?: string | undefined;
}

export interface InitReport {
  readonly changes: readonly Change[];
  readonly missingPeers: readonly string[];
  readonly packageManager: string;
  readonly notes: readonly string[];
}

async function readOptional(path: string): AsyncResult<string | undefined, string> {
  const file = await readTextFile(path);
  if (file.ok) {
    return file;
  }
  if (file.error.kind === "FsError" && file.error.code === "ENOENT") {
    return ok(undefined);
  }
  return err(file.error.message);
}

function eslintTemplate(): string {
  return `import typerail from "typerail/eslint";

export default [
  { ignores: ["dist/**", "build/**", "coverage/**"] },
  ...typerail({ tsconfigRootDir: import.meta.dirname }),
];
`;
}

export const AGENTS_START = "<!-- typerail:start -->";
export const AGENTS_END = "<!-- typerail:end -->";

export function agentsSection(packageManager: string): string {
  return `${AGENTS_START}
## typerail

This project uses [typerail](https://github.com/wingravity/typerail), which reports code that TypeScript accepts but that can fail at runtime. A change is complete only when \`${packageManager} run check\` passes.

- Do not use \`as\` (except \`as const\`), non-null \`!\`, \`any\` or \`@ts-\` comments. Narrow values with checks (\`typeof\`, \`in\`, \`Array.isArray\`) or validate them with a schema.
- Do not write claims the compiler trusts without checking: type predicates (\`value is T\`), assertion functions, definite assignment (\`field!: T\`), overload signatures, or type arguments that only set the return type (\`get<User>(url)\`). Narrow, then build the typed value from the narrowed parts.
- Values from \`JSON.parse\`, \`response.json()\` and untyped libraries are \`any\`. Validate or narrow them before use.
- Await or return every promise, or handle its rejection with \`.catch\`.
- Type parameters that only read an array or object as readonly (\`readonly T[]\`, \`Readonly<T>\`, \`ReadonlySet<T>\`).
- \`// eslint-disable\` comments have no effect. Do not add them, and do not weaken \`eslint.config.js\` or \`tsconfig.json\` to make the check pass.
- Run \`npx typerail report --next 20\` for the highest-priority findings, each with a fix instruction.
- Every finding has a code such as TR101. Its explanation and fix are in \`node_modules/typerail/docs/gaps/\`.
${AGENTS_END}`;
}

function planAgents(text: string | undefined, packageManager: string): Change {
  const file = "AGENTS.md";
  const section = agentsSection(packageManager);
  if (text === undefined) {
    return {
      file,
      status: "created",
      detail: "typerail instructions for coding agents",
      content: `# Instructions for coding agents\n\n${section}\n`,
    };
  }
  const start = text.indexOf(AGENTS_START);
  const end = text.indexOf(AGENTS_END);
  if (start === -1 || end < start) {
    return {
      file,
      status: "updated",
      detail: "added typerail instructions",
      content: `${text.trimEnd()}\n\n${section}\n`,
    };
  }
  const updated = text.slice(0, start) + section + text.slice(end + AGENTS_END.length);
  return updated === text
    ? { file, status: "unchanged", detail: "typerail instructions are current" }
    : { file, status: "updated", detail: "refreshed typerail instructions", content: updated };
}

function planClaude(text: string | undefined): Change | undefined {
  if (text === undefined) {
    return undefined;
  }
  const file = "CLAUDE.md";
  if (/^@AGENTS\.md\s*$/mu.test(text)) {
    return { file, status: "unchanged", detail: "already imports AGENTS.md" };
  }
  return {
    file,
    status: "updated",
    detail: "imports AGENTS.md, so Claude Code also reads it",
    content: `@AGENTS.md\n\n${text}`,
  };
}

function planTsconfig(text: string | undefined): Result<Change, string> {
  const file = "tsconfig.json";
  if (text === undefined) {
    return ok({ file, status: "skipped", detail: "not found; create one, then run init again" });
  }
  const parsed = parseJsonc(file, text);
  if (!parsed.ok) {
    return parsed;
  }
  const current = parsed.value["extends"];
  const existing = typeof current === "string" ? [current] : asArray(current);
  if (existing.includes(TSCONFIG_ENTRY)) {
    return ok({ file, status: "unchanged", detail: `already extends ${TSCONFIG_ENTRY}` });
  }
  const next = existing.length === 0 ? TSCONFIG_ENTRY : [...existing, TSCONFIG_ENTRY];
  const updated = setTopLevelProperty(file, text, "extends", next);
  if (!updated.ok) {
    return updated;
  }
  return ok({ file, status: "updated", detail: `extends ${TSCONFIG_ENTRY}`, content: updated.value });
}

interface ExistingFile {
  readonly name: string;
  readonly text: string;
}

function planEslint(existing: ExistingFile | undefined, moduleType: boolean, force: boolean): Change {
  const file = existing?.name ?? (moduleType ? "eslint.config.js" : "eslint.config.mjs");
  if (existing?.text.includes("typerail/eslint") === true) {
    return { file, status: "unchanged", detail: "already uses typerail/eslint" };
  }
  if (existing !== undefined && !force) {
    return {
      file,
      status: "skipped",
      detail: "already exists; merge the typerail config by hand (shown below) or rerun with --force",
    };
  }
  return { file, status: existing === undefined ? "created" : "updated", detail: "typerail config", content: eslintTemplate() };
}

function readStringMap(value: unknown): Record<string, unknown> {
  return asRecord(value) ?? {};
}

function planPackageJson(
  text: string,
  pkg: Record<string, unknown>,
  packageSpec: string,
): Result<{ change: Change; missingPeers: string[]; notes: string[] }, string> {
  const file = "package.json";
  const scripts = readStringMap(pkg["scripts"]);
  const devDependencies = readStringMap(pkg["devDependencies"]);
  const dependencies = readStringMap(pkg["dependencies"]);
  const notes: string[] = [];
  const details: string[] = [];
  let content = text;

  if (scripts["check"] === undefined) {
    const updated = setTopLevelProperty(file, content, "scripts", { ...scripts, check: CHECK_SCRIPT });
    if (!updated.ok) {
      return updated;
    }
    content = updated.value;
    details.push(`"check" script`);
  } else if (scripts["check"] !== CHECK_SCRIPT) {
    notes.push(`Kept your existing "check" script. typerail expects: ${CHECK_SCRIPT}`);
  }

  if (devDependencies["typerail"] === undefined && dependencies["typerail"] === undefined) {
    const updated = setTopLevelProperty(file, content, "devDependencies", {
      ...devDependencies,
      typerail: packageSpec,
    });
    if (!updated.ok) {
      return updated;
    }
    content = updated.value;
    details.push(`typerail dev dependency (${packageSpec})`);
  } else if (devDependencies["typerail"] === undefined) {
    notes.push("typerail is in dependencies. Move it to devDependencies: it has no runtime code.");
  }

  const missingPeers = PEERS.filter((name) => devDependencies[name] === undefined && dependencies[name] === undefined);
  const change: Change =
    details.length === 0
      ? { file, status: "unchanged", detail: "check script and typerail already present" }
      : { file, status: "updated", detail: details.join(", "), content };
  return ok({ change, missingPeers, notes });
}

function planVscodeExtensions(text: string | undefined): Result<Change, string> {
  const file = ".vscode/extensions.json";
  if (text === undefined) {
    const serialized = safeJsonStringify({ recommendations: [ESLINT_EXTENSION] }, 2);
    return serialized.ok
      ? ok({ file, status: "created", detail: "recommends the ESLint extension", content: `${serialized.value}\n` })
      : err(serialized.error.message);
  }
  const parsed = parseJsonc(file, text);
  if (!parsed.ok) {
    return parsed;
  }
  const recommendations = asArray(parsed.value["recommendations"]);
  if (recommendations.includes(ESLINT_EXTENSION)) {
    return ok({ file, status: "unchanged", detail: "already recommends the ESLint extension" });
  }
  const updated = setTopLevelProperty(file, text, "recommendations", [...recommendations, ESLINT_EXTENSION]);
  return updated.ok
    ? ok({ file, status: "updated", detail: "recommends the ESLint extension", content: updated.value })
    : updated;
}

function planVscodeSettings(text: string | undefined, suppressionsSupported: boolean): Result<Change, string> {
  const file = ".vscode/settings.json";
  const source = text ?? "{}\n";
  const parsed = parseJsonc(file, source);
  if (!parsed.ok) {
    return parsed;
  }
  const details: string[] = [];
  let content = source;
  if (parsed.value["typescript.tsdk"] === undefined) {
    const updated = setTopLevelProperty(file, content, "typescript.tsdk", "node_modules/typescript/lib");
    if (!updated.ok) {
      return updated;
    }
    content = updated.value;
    details.push("project TypeScript version");
  }
  const eslintOptions = readStringMap(parsed.value["eslint.options"]);
  if (suppressionsSupported && eslintOptions["applySuppressions"] !== true) {
    const updated = setTopLevelProperty(file, content, "eslint.options", { ...eslintOptions, applySuppressions: true });
    if (!updated.ok) {
      return updated;
    }
    content = updated.value;
    details.push("ESLint bulk suppressions");
  }
  if (details.length === 0) {
    return ok({ file, status: "unchanged", detail: "already configured" });
  }
  return ok({ file, status: text === undefined ? "created" : "updated", detail: details.join(", "), content });
}

async function projectEslintVersion(cwd: string, pkg: Record<string, unknown>): Promise<string | undefined> {
  const installed = await readOptional(join(cwd, "node_modules/eslint/package.json"));
  if (installed.ok && installed.value !== undefined) {
    const parsed = safeJsonParse(installed.value);
    const version = parsed.ok ? asRecord(parsed.value)?.["version"] : undefined;
    if (typeof version === "string") {
      return version;
    }
  }
  const declared = readStringMap(pkg["devDependencies"])["eslint"] ?? readStringMap(pkg["dependencies"])["eslint"];
  return typeof declared === "string" ? declared : undefined;
}

async function detectPackageManager(cwd: string): Promise<string> {
  const lockfiles: readonly [string, string][] = [
    ["pnpm-lock.yaml", "pnpm"],
    ["bun.lock", "bun"],
    ["bun.lockb", "bun"],
    ["yarn.lock", "yarn"],
  ];
  for (const [lockfile, manager] of lockfiles) {
    const found = await readOptional(join(cwd, lockfile));
    if (found.ok && found.value !== undefined) {
      return manager;
    }
  }
  return "npm";
}

async function findEslintConfig(cwd: string): Promise<ExistingFile | undefined> {
  for (const name of ESLINT_CONFIG_NAMES) {
    const found = await readOptional(join(cwd, name));
    if (found.ok && found.value !== undefined) {
      return { name, text: found.value };
    }
  }
  return undefined;
}

export async function planInit(options: InitOptions): AsyncResult<InitReport, string> {
  const { cwd } = options;
  const packageText = await readOptional(join(cwd, "package.json"));
  if (!packageText.ok) {
    return packageText;
  }
  if (packageText.value === undefined) {
    return err(`No package.json in ${cwd}. Run typerail init from the project root.`);
  }
  const parsedPackage = safeJsonParse(packageText.value);
  const pkg = parsedPackage.ok ? asRecord(parsedPackage.value) : undefined;
  if (pkg === undefined) {
    return err("package.json is not a valid JSON object");
  }

  const tsconfigText = await readOptional(join(cwd, "tsconfig.json"));
  const extensionsText = await readOptional(join(cwd, ".vscode/extensions.json"));
  const settingsText = await readOptional(join(cwd, ".vscode/settings.json"));
  if (!tsconfigText.ok) {
    return tsconfigText;
  }
  if (!extensionsText.ok) {
    return extensionsText;
  }
  if (!settingsText.ok) {
    return settingsText;
  }

  const tsconfig = planTsconfig(tsconfigText.value);
  const packageJson = planPackageJson(packageText.value, pkg, options.packageSpec);
  const extensions = planVscodeExtensions(extensionsText.value);
  const eslintVersion = await projectEslintVersion(cwd, pkg);
  const suppressionsSupported = eslintVersion === undefined || supportsSuppressionsApi(eslintVersion);
  const settings = planVscodeSettings(settingsText.value, suppressionsSupported);
  if (!tsconfig.ok) {
    return tsconfig;
  }
  if (!packageJson.ok) {
    return packageJson;
  }
  if (!extensions.ok) {
    return extensions;
  }
  if (!settings.ok) {
    return settings;
  }

  const eslint = planEslint(await findEslintConfig(cwd), pkg["type"] === "module", options.force === true);
  const packageManager = await detectPackageManager(cwd);
  const agentsText = await readOptional(join(cwd, "AGENTS.md"));
  const claudeText = await readOptional(join(cwd, "CLAUDE.md"));
  if (!agentsText.ok) {
    return agentsText;
  }
  if (!claudeText.ok) {
    return claudeText;
  }
  const claude = planClaude(claudeText.value);
  const notes = [...packageJson.value.notes];
  if (!suppressionsSupported) {
    notes.push(
      `Applying bulk suppressions in the editor needs ESLint ${SUPPRESSIONS_API_VERSION} or later; this project uses ESLint ${eslintVersion}. The editor setting was not added.`,
    );
  }
  if (eslint.status === "skipped") {
    notes.push(`Add this to ${eslint.file}:\n\n${eslintTemplate()}`);
  }

  return ok({
    changes: [
      tsconfig.value,
      eslint,
      packageJson.value.change,
      planAgents(agentsText.value, packageManager),
      ...(claude === undefined ? [] : [claude]),
      extensions.value,
      settings.value,
    ],
    missingPeers: packageJson.value.missingPeers,
    packageManager,
    notes,
  });
}

export async function applyInit(cwd: string, report: InitReport): AsyncResult<void, FsError> {
  for (const change of report.changes) {
    if (change.content === undefined) {
      continue;
    }
    const path = join(cwd, change.file);
    if (change.file.startsWith(".vscode/")) {
      const dir = await ensureDir(join(cwd, ".vscode"));
      if (!dir.ok) {
        return dir;
      }
    }
    const written = await writeTextFile(path, change.content);
    if (!written.ok) {
      return written;
    }
  }
  return ok(undefined);
}

export function installCommand(packageManager: string, peers: readonly string[]): string {
  const add = packageManager === "npm" ? "npm install -D" : `${packageManager} add -D`;
  return peers.length === 0 ? `${packageManager} install` : `${add} ${peers.join(" ")}`;
}
