import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import ts from "typescript";
import { GAPS, type Gap } from "../src/gaps.ts";

const root = resolve(import.meta.dirname, "..");
const proofDir = join(root, "test/gaps");
const docsDir = join(root, "docs/gaps");

function typerailOptions(): ts.CompilerOptions {
  const configPath = join(root, "config/tsconfig.json");
  const read = ts.readConfigFile(configPath, (path) => ts.sys.readFile(path));
  const parsed = ts.convertCompilerOptionsFromJson(read.config.compilerOptions, root);
  return {
    ...parsed.options,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    lib: ["lib.es2022.d.ts"],
    types: ["node"],
    skipLibCheck: true,
    rootDir: proofDir,
  };
}

function proofFile(gap: Gap): string {
  return join(proofDir, `${gap.code}.ts`);
}

function rootFiles(gap: Gap): string[] {
  const siblings = readdirSync(proofDir).filter((name) => name.startsWith(`${gap.code}-`) && name.endsWith(".ts") && !name.endsWith(".d.ts"));
  return [proofFile(gap), ...siblings.map((name) => join(proofDir, name))];
}

function errorsIn(program: ts.Program, file: string): string[] {
  const source = program.getSourceFile(file);
  return ts
    .getPreEmitDiagnostics(program, source)
    .filter((d) => d.category === ts.DiagnosticCategory.Error)
    .map((d) => `TS${String(d.code)}: ${ts.flattenDiagnosticMessageText(d.messageText, " ")}`);
}

const RUNNER = `import { pathToFileURL } from "node:url";
const mod = await import(pathToFileURL(process.argv[2]).href);
const result = await mod.proof();
if (typeof result === "object" && result !== null && "expected" in result && "actual" in result) {
  process.exitCode = JSON.stringify(result.expected) === JSON.stringify(result.actual) ? 0 : 3;
}
`;

function run(outDir: string, gap: Gap): ReturnType<typeof spawnSync> {
  return spawnSync(process.execPath, [join(outDir, "runner.mjs"), join(outDir, `${gap.code}.js`)], { encoding: "utf8" });
}

function expectFailure(gap: Gap, result: ReturnType<typeof spawnSync>): void {
  if (gap.proof === "wrong-value") {
    assert.equal(result.status, 3, `${gap.code}: the proof should return a wrong value. stderr: ${String(result.stderr)}`);
    return;
  }
  assert.equal(result.status, 1, `${gap.code}: the proof should throw. stdout: ${String(result.stdout)}`);
  assert.match(String(result.stderr), /Error/u, `${gap.code}: the proof should fail with an error`);
}

function caseSensitiveFileSystem(): boolean {
  return !existsSync(join(proofDir, "tr607-TARGET.ts"));
}

const withProof = GAPS.filter((gap) => gap.proof !== "none");
const proven = withProof.filter((gap) => gap.fixedIn === undefined);
const plain = proven.filter((gap) => gap.flag === undefined);
const flagged = proven.filter((gap) => gap.flag !== undefined);

describe("gap catalog", () => {
  it("has unique codes in the TR000 format", () => {
    const codes = GAPS.map((gap) => gap.code);
    assert.deepEqual(codes.filter((code) => !/^TR\d{3}$/u.test(code)), []);
    assert.equal(new Set(codes).size, codes.length);
  });

  it("has a proof for every gap and no proof without a gap", () => {
    const expected = withProof.map((gap) => `${gap.code}.ts`).sort();
    const actual = readdirSync(proofDir).filter((name) => /^TR\d{3}\.ts$/u.test(name)).sort();
    assert.deepEqual(actual, expected);
  });

  it("has a page for every code, listed in the index", () => {
    const index = readFileSync(join(docsDir, "README.md"), "utf8");
    for (const gap of GAPS) {
      const page = join(docsDir, `${gap.code}.md`);
      assert.ok(existsSync(page), `missing docs/gaps/${gap.code}.md`);
      assert.ok(readFileSync(page, "utf8").startsWith(`# ${gap.code}: ${gap.title}\n`), `${gap.code}: page title`);
      assert.ok(index.includes(`[${gap.code}](${gap.code}.md)`), `${gap.code}: missing from docs/gaps/README.md`);
    }
  });

  it("shows each proof in its page", () => {
    for (const gap of withProof) {
      const page = readFileSync(join(docsDir, `${gap.code}.md`), "utf8");
      const proof = readFileSync(proofFile(gap), "utf8");
      assert.ok(page.includes(`\`\`\`ts\n${proof}\`\`\``), `${gap.code}: the page must show test/gaps/${gap.code}.ts unchanged`);
    }
  });
});

describe("gap proofs", () => {
  let outDir = "";

  before(() => {
    outDir = mkdtempSync(join(tmpdir(), "typerail-gaps-"));
    writeFileSync(join(outDir, "package.json"), '{ "type": "module" }\n');
    writeFileSync(join(outDir, "runner.mjs"), RUNNER);
    for (const name of readdirSync(proofDir).filter((file) => file.endsWith(".js"))) {
      copyFileSync(join(proofDir, name), join(outDir, name));
    }
  });

  after(() => {
    rmSync(outDir, { recursive: true, force: true });
  });

  it("compile under the typerail configuration", () => {
    const program = ts.createProgram(plain.map(proofFile), { ...typerailOptions(), outDir });
    const failures = plain.flatMap((gap) =>
      errorsIn(program, proofFile(gap)).map(
        (error) => `${gap.code}: TypeScript ${ts.version} now rejects the proof, so the gap may be fixed. ${error}`,
      ),
    );
    assert.deepEqual(failures, []);
    program.emit();
  });

  for (const gap of plain) {
    it(`${gap.code} fails at runtime: ${gap.title}`, () => {
      expectFailure(gap, run(outDir, gap));
    });
  }

  for (const gap of flagged) {
    it(`${gap.code} compiles without ${String(gap.flag)} and is rejected with it`, (t) => {
      if (gap.code === "TR607" && caseSensitiveFileSystem()) {
        t.skip("needs a case-insensitive file system");
        return;
      }
      const flag = String(gap.flag);
      const dependent = flag === "strict" ? { exactOptionalPropertyTypes: false } : {};
      const without = ts.createProgram(rootFiles(gap), { ...typerailOptions(), outDir, ...dependent, [flag]: false });
      assert.deepEqual(errorsIn(without, proofFile(gap)), [], `${gap.code}: TypeScript ${ts.version} rejects the proof even without ${flag}`);
      const withFlag = ts.createProgram(rootFiles(gap), { ...typerailOptions(), noEmit: true });
      assert.notDeepEqual(errorsIn(withFlag, proofFile(gap)), [], `${gap.code}: ${flag} no longer rejects the proof`);
      if (gap.proof !== "compile-only") {
        without.emit();
        expectFailure(gap, run(outDir, gap));
      }
    });
  }
});
