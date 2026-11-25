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
}

function collectTypeScript(cwd: string, configPath: string, flags: ts.CompilerOptions): Result<TypeScriptResult, string> {
  const read = ts.readConfigFile(configPath, (path) => ts.sys.readFile(path));
  if (read.error !== undefined) {
    return err(ts.flattenDiagnosticMessageText(read.error.messageText, "\n"));
  }
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, dirname(configPath));
  const program = ts.createProgram({ rootNames: parsed.fileNames, options: { ...parsed.options, ...flags, noEmit: true } });
  const findings: Finding[] = [];
  for (const diagnostic of ts.getPreEmitDiagnostics(program)) {
    const source = diagnostic.file;
    if (source === undefined || diagnostic.start === undefined || source.fileName.includes("/node_modules/")) {
      continue;
    }
    const position = source.getLineAndCharacterOfPosition(diagnostic.start);
    findings.push(
      finding(
        {
          source: "typescript",
          rule: `TS${String(diagnostic.code)}`,
          file: relative(cwd, source.fileName),
          line: position.line + 1,
          column: position.character + 1,
          message: ts.flattenDiagnosticMessageText(diagnostic.messageText, " "),
        },
        classifyTypeScript(diagnostic.code),
      ),
    );
  }
  const files = parsed.fileNames.filter((file) => LINTED_SOURCE.test(file) && !file.includes("/node_modules/"));
  return ok({ findings, files });
}

function cliConfig(configPath: string): Linter.Config[] {
  return [
    { linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: "off" } },
    {
      files: [...DEFAULT_FILES],
      languageOptions: {
        parser: tseslint.parser,
        parserOptions: { project: configPath, tsconfigRootDir: dirname(configPath) },
      },
      plugins: { "@typescript-eslint": tseslint.plugin, typerail: compatiblePlugin },
      rules: typerailRules(),
    },
    { files: [...DEFAULT_TESTS], rules: Object.fromEntries(RELAXED_IN_TESTS.map((rule) => [rule, "off"])) },
  ];
}

async function collectEslint(cwd: string, configPath: string, files: readonly string[]): AsyncResult<Finding[], string> {
  if (files.length === 0) {
    return ok([]);
  }
  const created = attempt(
    () =>
      new ESLint({
        cwd,
        overrideConfigFile: true,
        overrideConfig: cliConfig(configPath),
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

export async function buildReport(options: AnalyzeOptions): AsyncResult<Report, string> {
  const { cwd } = options;
  const configPath = resolve(cwd, options.tsconfig ?? "tsconfig.json");
  const flags = await typerailCompilerOptions();
  if (!flags.ok) {
    return flags;
  }
  const typescript = collectTypeScript(cwd, configPath, flags.value);
  if (!typescript.ok) {
    return typescript;
  }
  const eslint = await collectEslint(cwd, configPath, typescript.value.files);
  if (!eslint.ok) {
    return eslint;
  }
  return ok({
    generatedAt: new Date().toISOString(),
    project: cwd,
    findings: [...typescript.value.findings, ...eslint.value].sort(compareFindings),
  });
}
