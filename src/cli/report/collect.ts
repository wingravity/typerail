import { existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";
import { ESLint, type Linter } from "eslint";
import tseslint from "typescript-eslint";
import { attempt, attemptAsync, err, ok, type AsyncResult, type Result } from "../../internal/result.ts";
import { describeCause } from "../../internal/error.ts";
import { readTextFile } from "../../internal/fs.ts";
import { DEFAULT_FILES, DEFAULT_TESTS, RELAXED_IN_TESTS, typerailRules } from "../../eslint/index.ts";
import { compatiblePlugin } from "../../eslint/plugin.ts";
import { asRecord, parseJsonc } from "../jsonc.ts";
import { classifyEslint, classifyTypeScript, UNPARSED_FILE, type Classification, type Priority } from "./classify.ts";

export interface Finding {
  readonly source: "typescript" | "eslint";
  readonly rule: string;
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly message: string;
  readonly test: boolean;
  readonly priority: Priority;
  readonly why: string;
  readonly fix: string;
  readonly code?: string;
}

export interface Report {
  readonly generatedAt: string;
  readonly project: string;
  readonly findings: readonly Finding[];
  readonly warnings: readonly string[];
}

export interface AnalyzeOptions {
  readonly cwd: string;
  readonly tsconfig?: string | undefined;
}

const TEST_FILE = /(?:\.(?:test|spec)\.[cm]?tsx?$)|(?:(?:^|\/)__tests__\/)/u;
const LINTED_SOURCE = /(?<!\.d)\.[cm]?tsx?$/u;

export function isTestFile(file: string): boolean {
  return TEST_FILE.test(file);
}

function finding(base: Omit<Finding, "priority" | "why" | "fix" | "test" | "code">, classification: Classification): Finding {
  return { ...base, test: isTestFile(base.file), ...classification };
}

export async function typerailCompilerOptions(): AsyncResult<ts.CompilerOptions, string> {
  const path = join(import.meta.dirname, "../../../config/tsconfig.json");
  const text = await readTextFile(path);
  if (!text.ok) {
    return err(`cannot read ${path}: ${text.error.message}`);
  }
  const parsed = parseJsonc(path, text.value);
  if (!parsed.ok) {
    return parsed;
  }
  const converted = ts.convertCompilerOptionsFromJson(asRecord(parsed.value["compilerOptions"]) ?? {}, dirname(path));
  return ok(converted.options);
}

interface TypeScriptResult {
  readonly findings: Finding[];
  readonly files: string[];
  readonly configs: string[];
  readonly browserFiles: Set<string>;
}

function isBrowserConfig(parsed: ts.ParsedCommandLine): boolean {
  const types = parsed.options.types ?? [];
  const dom = (parsed.options.lib ?? []).some((lib) => lib.toLowerCase().includes("dom"));
  const node = types.includes("node");
  const plugins = parsed.options["plugins"];
  const next =
    Array.isArray(plugins) &&
    plugins.some((plugin) => typeof plugin === "object" && "name" in plugin && plugin.name === "next");
  return !next && ((dom && !node) || types.includes("vite/client"));
}

function isClientModule(source: ts.SourceFile): boolean {
  const first = source.statements[0];
  return (
    first !== undefined &&
    ts.isExpressionStatement(first) &&
    ts.isStringLiteral(first.expression) &&
    first.expression.text === "use client"
  );
}

interface ParsedConfig {
  readonly path: string;
  readonly parsed: ts.ParsedCommandLine;
}

function readConfig(configPath: string): Result<ts.ParsedCommandLine, string> {
  const read = ts.readConfigFile(configPath, (path) => ts.sys.readFile(path));
  if (read.error !== undefined) {
    return err(ts.flattenDiagnosticMessageText(read.error.messageText, "\n"));
  }
  return ok(ts.parseJsonConfigFileContent(read.config, ts.sys, dirname(configPath), undefined, configPath));
}

function configsToCheck(configPath: string): Result<ParsedConfig[], string> {
  const configs: ParsedConfig[] = [];
  const seen = new Set<string>();
  const queue = [configPath];
  for (let index = 0; index < queue.length && index < 100; index++) {
    const path = queue[index];
    if (path === undefined || seen.has(path)) {
      continue;
    }
    seen.add(path);
    const parsed = readConfig(path);
    if (!parsed.ok) {
      return parsed;
    }
    if (parsed.value.fileNames.length > 0) {
      configs.push({ path, parsed: parsed.value });
    }
    for (const reference of parsed.value.projectReferences ?? []) {
      queue.push(ts.resolveProjectReferencePath(reference));
    }
  }
  return ok(configs);
}

function compilerOptions(parsed: ts.ParsedCommandLine, flags: ts.CompilerOptions): ts.CompilerOptions {
  const major = Number(ts.versionMajorMinor.split(".")[0]);
  const deprecations = major >= 6 && parsed.options.ignoreDeprecations === undefined ? { ignoreDeprecations: "6.0" } : {};
  return { ...parsed.options, ...flags, ...deprecations, noEmit: true, composite: false, incremental: false };
}

function diagnosticFinding(cwd: string, configPath: string, diagnostic: ts.Diagnostic): Finding | undefined {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, " ");
  const rule = `TS${String(diagnostic.code)}`;
  const source = diagnostic.file;
  if (source === undefined || diagnostic.start === undefined) {
    if (diagnostic.category !== ts.DiagnosticCategory.Error) {
      return undefined;
    }
    return finding({ source: "typescript", rule, file: relative(cwd, configPath), line: 1, column: 1, message }, UNPARSED_FILE);
  }
  if (source.fileName.includes("/node_modules/")) {
    return undefined;
  }
  const position = source.getLineAndCharacterOfPosition(diagnostic.start);
  const file = relative(cwd, source.fileName);
  return finding(
    { source: "typescript", rule, file, line: position.line + 1, column: position.character + 1, message },
    source.fileName.endsWith(".json") ? UNPARSED_FILE : classifyTypeScript(diagnostic.code),
  );
}

function collectTypeScript(cwd: string, configPath: string, flags: ts.CompilerOptions): Result<TypeScriptResult, string> {
  const configs = configsToCheck(configPath);
  if (!configs.ok) {
    return configs;
  }
  if (configs.value.length === 0) {
    const name = relative(cwd, configPath);
    return err(`${name === "" ? configPath : name} and the projects it references include no files to check.`);
  }
  const findings = new Map<string, Finding>();
  const files = new Set<string>();
  const browserFiles = new Set<string>();
  for (const { path, parsed } of configs.value) {
    const program = ts.createProgram({ rootNames: parsed.fileNames, options: compilerOptions(parsed, flags), projectReferences: [] });
    const browserConfig = isBrowserConfig(parsed);
    for (const file of parsed.fileNames) {
      const source = program.getSourceFile(file);
      if (browserConfig || (source !== undefined && isClientModule(source))) {
        browserFiles.add(relative(cwd, file));
      }
    }
    const diagnostics = [...parsed.errors, ...program.getOptionsDiagnostics(), ...ts.getPreEmitDiagnostics(program)];
    for (const diagnostic of diagnostics) {
      const found = diagnosticFinding(cwd, path, diagnostic);
      if (found !== undefined) {
        findings.set(`${found.file}:${String(found.line)}:${String(found.column)}:${found.rule}`, found);
      }
    }
    for (const file of parsed.fileNames) {
      if (LINTED_SOURCE.test(file) && !file.includes("/node_modules/")) {
        files.add(file);
      }
    }
  }
  return ok({
    findings: [...findings.values()],
    files: [...files],
    configs: configs.value.map((config) => config.path),
    browserFiles,
  });
}

function cliConfig(configs: readonly string[]): Linter.Config[] {
  return [
    { linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: "off" } },
    {
      files: [...DEFAULT_FILES],
      languageOptions: {
        parser: tseslint.parser,
        parserOptions: { project: [...configs] },
      },
      plugins: { "@typescript-eslint": tseslint.plugin, typerail: compatiblePlugin },
      rules: typerailRules(),
    },
    { files: [...DEFAULT_TESTS], rules: Object.fromEntries(RELAXED_IN_TESTS.map((rule) => [rule, "off"])) },
  ];
}

async function collectEslint(cwd: string, configs: readonly string[], files: readonly string[]): AsyncResult<Finding[], string> {
  if (files.length === 0) {
    return ok([]);
  }
  const created = attempt(
    () =>
      new ESLint({
        cwd,
        overrideConfigFile: true,
        overrideConfig: cliConfig(configs),
        warnIgnored: false,
      }),
    (cause) => `ESLint could not start: ${describeCause(cause)}`,
  );
  if (!created.ok) {
    return created;
  }
  const eslint = created.value;
  const results = await attemptAsync(
    () => eslint.lintFiles([...files]),
    (cause) => `ESLint failed: ${describeCause(cause)}`,
  );
  if (!results.ok) {
    return results;
  }
  return ok(
    results.value.flatMap((result) =>
      result.messages.flatMap((message) => {
        const fatal = message.fatal === true;
        if (message.ruleId === null && !fatal) {
          return [];
        }
        return [
          finding(
            {
              source: "eslint",
              rule: message.ruleId ?? "parse-error",
              file: relative(cwd, result.filePath),
              line: message.line,
              column: message.column,
              message: message.message,
            },
            message.ruleId === null ? UNPARSED_FILE : classifyEslint(message.ruleId),
          ),
        ];
      }),
    ),
  );
}

function compareFindings(a: Finding, b: Finding): number {
  const keys = [
    Number(a.test) - Number(b.test),
    a.priority - b.priority,
    a.file.localeCompare(b.file),
    a.line - b.line,
    a.column - b.column,
  ];
  return keys.find((difference) => difference !== 0) ?? 0;
}

function ancestors(directory: string): string[] {
  const list: string[] = [];
  let current = directory;
  for (let depth = 0; depth < 64; depth++) {
    list.push(current);
    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return list;
}

async function declaredDependencies(cwd: string): Promise<{ readonly root: string; readonly names: string[] } | undefined> {
  const root = ancestors(cwd).find((directory) => existsSync(join(directory, "package.json")));
  if (root === undefined) {
    return undefined;
  }
  const text = await readTextFile(join(root, "package.json"));
  const parsed = text.ok ? parseJsonc("package.json", text.value) : undefined;
  if (parsed?.ok !== true) {
    return undefined;
  }
  const names = ["dependencies", "devDependencies"].flatMap((field) => Object.keys(asRecord(parsed.value[field]) ?? {}));
  return { root, names: names.filter((name) => name !== "@wingravity/typerail") };
}

async function dependencyCheck(cwd: string): AsyncResult<string[], string> {
  const declared = await declaredDependencies(cwd);
  if (declared === undefined || declared.names.length === 0) {
    return ok([]);
  }
  const directories = ancestors(declared.root);
  const missing = declared.names.filter((name) => !directories.some((directory) => existsSync(join(directory, "node_modules", name))));
  if (missing.length === declared.names.length) {
    return err("The project's dependencies are not installed. Install them first (for example npm install): typerail needs them for type information.");
  }
  if (missing.length === 0) {
    return ok([]);
  }
  const listed = missing.slice(0, 5).join(", ") + (missing.length > 5 ? ` and ${String(missing.length - 5)} more` : "");
  return ok([`${String(missing.length)} declared dependencies are not installed (${listed}). Findings that depend on their types may be wrong.`]);
}

const PROCESS_CRASHES = new Set(["TR501", "TR502"]);

function inBrowser(finding: Finding, browserFiles: ReadonlySet<string>): Finding {
  if (finding.code === undefined || !PROCESS_CRASHES.has(finding.code) || !browserFiles.has(finding.file)) {
    return finding;
  }
  return {
    ...finding,
    priority: 1,
    why: "This code runs in a browser, where a rejected promise that nothing handles is only logged: the failure is lost and the user sees nothing happen.",
  };
}

export async function buildReport(options: AnalyzeOptions): AsyncResult<Report, string> {
  const { cwd } = options;
  const dependencies = await dependencyCheck(cwd);
  if (!dependencies.ok) {
    return dependencies;
  }
  const configPath = resolve(cwd, options.tsconfig ?? "tsconfig.json");
  const flags = await typerailCompilerOptions();
  if (!flags.ok) {
    return flags;
  }
  const typescript = collectTypeScript(cwd, configPath, flags.value);
  if (!typescript.ok) {
    return typescript;
  }
  const eslint = await collectEslint(cwd, typescript.value.configs, typescript.value.files);
  if (!eslint.ok) {
    return eslint;
  }
  return ok({
    generatedAt: new Date().toISOString(),
    project: cwd,
    findings: [...typescript.value.findings, ...eslint.value]
      .map((found) => inBrowser(found, typescript.value.browserFiles))
      .sort(compareFindings),
    warnings: dependencies.value,
  });
}
