import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { ESLint, type Linter } from "eslint";
import ts from "typescript";
import { typerail } from "../src/eslint/index.ts";

const fixtureDir = resolve(import.meta.dirname, "fixtures/project");
const fixtureFiles = readdirSync(fixtureDir).filter((name) => name.endsWith(".ts"));

function expectedFindings(file: string): string[] {
  const lines = readFileSync(join(fixtureDir, file), "utf8").split("\n");
  return lines.flatMap((line, index) => {
    const marker = /@expect (.+)$/u.exec(line);
    if (marker?.[1] === undefined) {
      return [];
    }
    return marker[1]
      .trim()
      .split(/[\s,]+/u)
      .map((id) => `${String(index + 1)} ${id}`);
  });
}

function compilerFindings(): Map<string, string[]> {
  const configPath = join(fixtureDir, "tsconfig.json");
  const config = ts.readConfigFile(configPath, (path) => ts.sys.readFile(path));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, fixtureDir);
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  const findings = new Map<string, string[]>();
  for (const diagnostic of ts.getPreEmitDiagnostics(program)) {
    const file = diagnostic.file;
    if (file === undefined || !file.fileName.startsWith(fixtureDir) || diagnostic.start === undefined) {
      continue;
    }
    const { line } = file.getLineAndCharacterOfPosition(diagnostic.start);
    const name = basename(file.fileName);
    findings.set(name, [...(findings.get(name) ?? []), `${String(line + 1)} TS${String(diagnostic.code)}`]);
  }
  return findings;
}

async function lintFindings(): Promise<Map<string, string[]>> {
  const eslint = new ESLint({
    cwd: fixtureDir,
    overrideConfigFile: true,
    overrideConfig: typerail({ tsconfigRootDir: fixtureDir }) as unknown as Linter.Config[],
  });
  const results = await eslint.lintFiles(fixtureFiles);
  return new Map(
    results.map((result) => [
      basename(result.filePath),
      result.messages.map((m) => `${String(m.line)} ${m.ruleId ?? (m.fatal === true ? "fatal" : "inline-config")}`),
    ]),
  );
}

describe("tsconfig + eslint config against fixtures", () => {
  let compiler = new Map<string, string[]>();
  let lint = new Map<string, string[]>();

  before(async () => {
    compiler = compilerFindings();
    lint = await lintFindings();
  });

  for (const file of fixtureFiles) {
    it(file, () => {
      const actual = [...(compiler.get(file) ?? []), ...(lint.get(file) ?? [])];
      const sort = (list: string[]): string[] => [...list].sort((a, b) => parseInt(a) - parseInt(b) || a.localeCompare(b));
      assert.deepEqual(sort(actual), sort(expectedFindings(file)));
    });
  }
});
