import { join } from "node:path";
import { err, ok, type AsyncResult, type Result } from "../internal/result.ts";
import { safeJsonParse } from "../internal/json.ts";
import { readTextFile, writeTextFile, type FsError } from "../internal/fs.ts";
import { asRecord, setTopLevelProperty } from "./jsonc.ts";
import { BASELINE_FILE } from "./baseline.ts";

export const PACKAGE_NAME = "@wingravity/typerail";
export const SCRIPT_NAME = "typerail";
export const SCRIPT = "typerail check";

export interface InitOptions {
  readonly cwd: string;
  readonly packageSpec: string;
  readonly dryRun?: boolean | undefined;
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

export const AGENTS_START = "<!-- typerail:start -->";
export const AGENTS_END = "<!-- typerail:end -->";

export function agentsSection(packageManager: string): string {
  return `${AGENTS_START}
## typerail

This project uses [typerail](https://github.com/wingravity/typerail), which reports code that TypeScript accepts but that can fail at runtime. A change is complete only when \`${packageManager} run ${SCRIPT_NAME}\` passes.

- Do not use \`as\` (except \`as const\`), non-null \`!\`, \`any\` or \`@ts-\` comments. Narrow values with checks (\`typeof\`, \`in\`, \`Array.isArray\`) or validate them with a schema.
- Do not write claims the compiler trusts without checking: type predicates (\`value is T\`), assertion functions, definite assignment (\`field!: T\`), overload signatures, or type arguments that only set the return type (\`get<User>(url)\`). Narrow, then build the typed value from the narrowed parts.
- Values from \`JSON.parse\`, \`response.json()\` and untyped libraries are \`any\`. Validate or narrow them before use.
- Await or return every promise, or handle its rejection with \`.catch\`.
- Type parameters that only read an array or object as readonly (\`readonly T[]\`, \`Readonly<T>\`, \`ReadonlySet<T>\`).
- typerail uses its own compiler flags and rules. \`// eslint-disable\` comments and changes to \`tsconfig.json\` or \`eslint.config.js\` do not affect it. Do not edit \`${BASELINE_FILE}\` or run \`typerail check --update-baseline\` to make the check pass.
- Run \`npx typerail report --next 20\` for the highest-priority findings, each with a fix instruction.
- Every finding has a code such as TR101. Its explanation and fix are in \`node_modules/${PACKAGE_NAME}/docs/gaps/\`.
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

function readStringMap(value: unknown): Record<string, unknown> {
  return asRecord(value) ?? {};
}

function planPackageJson(
  text: string,
  pkg: Readonly<Record<string, unknown>>,
  packageSpec: string,
): Result<{ change: Change; notes: string[] }, string> {
  const file = "package.json";
  const scripts = readStringMap(pkg["scripts"]);
  const devDependencies = readStringMap(pkg["devDependencies"]);
  const dependencies = readStringMap(pkg["dependencies"]);
  const notes: string[] = [];
  const details: string[] = [];
  let content = text;

  if (scripts[SCRIPT_NAME] === undefined) {
    const updated = setTopLevelProperty(file, content, "scripts", { ...scripts, [SCRIPT_NAME]: SCRIPT });
    if (!updated.ok) {
      return updated;
    }
    content = updated.value;
    details.push(`"${SCRIPT_NAME}" script`);
  } else if (scripts[SCRIPT_NAME] !== SCRIPT) {
    notes.push(`Kept your existing "${SCRIPT_NAME}" script. typerail expects: ${SCRIPT}`);
  }

  if (devDependencies[PACKAGE_NAME] === undefined && dependencies[PACKAGE_NAME] === undefined) {
    const updated = setTopLevelProperty(file, content, "devDependencies", { ...devDependencies, [PACKAGE_NAME]: packageSpec });
    if (!updated.ok) {
      return updated;
    }
    content = updated.value;
    details.push(`${PACKAGE_NAME} dev dependency (${packageSpec})`);
  } else if (devDependencies[PACKAGE_NAME] === undefined) {
    notes.push(`${PACKAGE_NAME} is in dependencies. Move it to devDependencies: it has no runtime code.`);
  }

  const change: Change =
    details.length === 0
      ? { file, status: "unchanged", detail: "typerail script and dependency already present" }
      : { file, status: "updated", detail: details.join(", "), content };
  return ok({ change, notes });
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

  const packageJson = planPackageJson(packageText.value, pkg, options.packageSpec);
  if (!packageJson.ok) {
    return packageJson;
  }
  const packageManager = await detectPackageManager(cwd);
  const tsconfigText = await readOptional(join(cwd, "tsconfig.json"));
  const agentsText = await readOptional(join(cwd, "AGENTS.md"));
  const claudeText = await readOptional(join(cwd, "CLAUDE.md"));
  if (!tsconfigText.ok) {
    return tsconfigText;
  }
  if (!agentsText.ok) {
    return agentsText;
  }
  if (!claudeText.ok) {
    return claudeText;
  }
  const notes = [...packageJson.value.notes];
  if (tsconfigText.value === undefined) {
    notes.push("No tsconfig.json found. typerail check needs one to know which files to check, or pass --project <tsconfig>.");
  }
  const claude = planClaude(claudeText.value);

  return ok({
    changes: [packageJson.value.change, planAgents(agentsText.value, packageManager), ...(claude === undefined ? [] : [claude])],
    packageManager,
    notes,
  });
}

export async function applyInit(cwd: string, report: InitReport): AsyncResult<void, FsError> {
  for (const change of report.changes) {
    if (change.content === undefined) {
      continue;
    }
    const written = await writeTextFile(join(cwd, change.file), change.content);
    if (!written.ok) {
      return written;
    }
  }
  return ok(undefined);
}

export function installCommand(packageManager: string): string {
  return `${packageManager} install`;
}
