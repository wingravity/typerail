import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { AGENTS_END, AGENTS_START, applyInit, PACKAGE_NAME, planInit, SCRIPT, SCRIPT_NAME, type InitReport } from "../src/cli/init.ts";
import { parseJsonc } from "../src/cli/jsonc.ts";
import { applyBaseline, BASELINE_FILE, countFindings } from "../src/cli/baseline.ts";
import type { Finding } from "../src/cli/report/collect.ts";

const SPEC = "^1.2.3";
let dir = "";

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "typerail-init-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function write(file: string, content: string): Promise<void> {
  await mkdir(join(dir, file, ".."), { recursive: true });
  await writeFile(join(dir, file), content);
}

function read(file: string): Promise<string> {
  return readFile(join(dir, file), "utf8");
}

async function init(options: { dryRun?: boolean } = {}): Promise<InitReport> {
  const report = await planInit({ cwd: dir, packageSpec: SPEC, ...options });
  assert.ok(report.ok, report.ok ? "" : report.error);
  if (options.dryRun !== true) {
    const applied = await applyInit(dir, report.value);
    assert.ok(applied.ok);
  }
  return report.value;
}

function statuses(report: InitReport): Record<string, string> {
  return Object.fromEntries(report.changes.map((change) => [change.file, change.status]));
}

describe("typerail init", () => {
  it("adds the dependency, the script and the agent instructions, and nothing else", async () => {
    await write("package.json", `{\n  "name": "app",\n  "type": "module"\n}\n`);
    await write("tsconfig.json", "{}");

    const report = await init();

    assert.deepEqual(statuses(report), { "package.json": "updated", "AGENTS.md": "created" });
    const pkg = parseJsonc("package.json", await read("package.json"));
    assert.ok(pkg.ok);
    assert.deepEqual(pkg.value["scripts"], { [SCRIPT_NAME]: SCRIPT });
    assert.deepEqual(pkg.value["devDependencies"], { [PACKAGE_NAME]: SPEC });
    assert.equal(await read("tsconfig.json"), "{}");
    await assert.rejects(read("eslint.config.js"));
    await assert.rejects(read(".vscode/settings.json"));
    assert.deepEqual(report.notes, []);
  });

  it("changes nothing when run a second time", async () => {
    await write("package.json", `{ "name": "app", "type": "module" }`);
    await write("tsconfig.json", "{}");
    await init();
    const before = await read("package.json");

    const second = await init();

    assert.ok(second.changes.every((change) => change.status === "unchanged"));
    assert.equal(await read("package.json"), before);
  });

  it("writes nothing in a dry run", async () => {
    await write("package.json", `{ "name": "app" }`);
    const report = await init({ dryRun: true });
    assert.equal(statuses(report)["package.json"], "updated");
    assert.equal(await read("package.json"), `{ "name": "app" }`);
    await assert.rejects(read("AGENTS.md"));
  });

  it("keeps an existing typerail script and reports it", async () => {
    await write("package.json", `{ "name": "app", "scripts": { "typerail": "typerail check --project tsconfig.app.json" } }`);
    await write("tsconfig.json", "{}");
    const report = await init();
    const pkg = parseJsonc("package.json", await read("package.json"));
    assert.ok(pkg.ok);
    assert.deepEqual(pkg.value["scripts"], { typerail: "typerail check --project tsconfig.app.json" });
    assert.ok(report.notes.some((note) => note.includes("Kept your existing")));
  });

  it("leaves typerail in dependencies and asks to move it", async () => {
    await write("package.json", `{ "name": "app", "dependencies": { "${PACKAGE_NAME}": "${SPEC}" } }`);
    await write("tsconfig.json", "{}");
    const report = await init();
    const pkg = parseJsonc("package.json", await read("package.json"));
    assert.ok(pkg.ok);
    assert.equal(pkg.value["devDependencies"], undefined);
    assert.ok(report.notes.some((note) => note.includes("Move it to devDependencies")));
  });

  it("notes a missing tsconfig and detects pnpm", async () => {
    await write("package.json", `{ "name": "app" }`);
    await write("pnpm-lock.yaml", "");
    const report = await init();
    assert.ok(report.notes.some((note) => note.includes("No tsconfig.json")));
    assert.equal(report.packageManager, "pnpm");
  });

  it("adds typerail instructions to an existing AGENTS.md once", async () => {
    await write("package.json", `{ "name": "app" }`);
    await write("tsconfig.json", "{}");
    await write("AGENTS.md", "# Team rules\n\nUse tabs.\n");

    const first = await init();
    assert.equal(statuses(first)["AGENTS.md"], "updated");
    const agents = await read("AGENTS.md");
    assert.ok(agents.startsWith("# Team rules\n\nUse tabs.\n\n<!-- typerail:start -->"));
    assert.ok(agents.includes("npm run typerail"));

    const second = await init();
    assert.equal(statuses(second)["AGENTS.md"], "unchanged");
    assert.equal(await read("AGENTS.md"), agents);
  });

  it("replaces an outdated typerail section and keeps the rest", async () => {
    await write("package.json", `{ "name": "app" }`);
    await write("tsconfig.json", "{}");
    await write("pnpm-lock.yaml", "");
    await write("AGENTS.md", `Before\n\n${AGENTS_START}\nold rules\n${AGENTS_END}\n\nAfter\n`);

    const report = await init();
    assert.equal(statuses(report)["AGENTS.md"], "updated");
    const agents = await read("AGENTS.md");
    assert.ok(agents.startsWith("Before\n\n<!-- typerail:start -->"));
    assert.ok(agents.endsWith(`${AGENTS_END}\n\nAfter\n`));
    assert.ok(!agents.includes("old rules"));
    assert.ok(agents.includes("pnpm run typerail"));
  });

  it("makes an existing CLAUDE.md import AGENTS.md, and never creates one", async () => {
    await write("package.json", `{ "name": "app" }`);
    await write("tsconfig.json", "{}");
    const without = await init();
    assert.equal(statuses(without)["CLAUDE.md"], undefined);
    await assert.rejects(read("CLAUDE.md"));

    await write("CLAUDE.md", "Prefer small commits.\n");
    const added = await init();
    assert.equal(statuses(added)["CLAUDE.md"], "updated");
    assert.equal(await read("CLAUDE.md"), "@AGENTS.md\n\nPrefer small commits.\n");

    const again = await init();
    assert.equal(statuses(again)["CLAUDE.md"], "unchanged");
  });

  it("fails without a package.json", async () => {
    const report = await planInit({ cwd: dir, packageSpec: SPEC });
    assert.ok(!report.ok && report.error.includes("No package.json"));
  });
});

function fakeFinding(file: string, rule: string, code?: string): Finding {
  return {
    source: "eslint",
    rule,
    file,
    line: 1,
    column: 1,
    message: "",
    test: false,
    priority: 1,
    why: "",
    fix: "",
    ...(code === undefined ? {} : { code }),
  };
}

describe("baseline", () => {
  it("counts findings per file and code, falling back to the rule", () => {
    const counts = countFindings([fakeFinding("a.ts", "r", "TR101"), fakeFinding("a.ts", "r", "TR101"), fakeFinding("b.ts", "TS2532")]);
    assert.deepEqual(counts, { "a.ts": { TR101: 2 }, "b.ts": { TS2532: 1 } });
  });

  it("lets through only findings beyond the recorded counts, and counts fixed ones", () => {
    const findings = [fakeFinding("a.ts", "r", "TR101"), fakeFinding("a.ts", "r", "TR101"), fakeFinding("b.ts", "TS2532")];
    const result = applyBaseline(findings, { "a.ts": { TR101: 1 }, "c.ts": { TR201: 2 } });
    assert.equal(result.fresh.length, 2);
    assert.equal(result.baselined, 1);
    assert.equal(result.fixed, 2);
  });
});

describe("typerail binary", () => {
  const main = resolve(import.meta.dirname, "../src/cli/main.ts");

  it("prints usage and rejects unknown commands", () => {
    const help = spawnSync(process.execPath, [main, "--help"], { encoding: "utf8" });
    assert.equal(help.status, 0);
    assert.ok(help.stdout.includes("Usage: typerail"));
    const unknown = spawnSync(process.execPath, [main, "nope"], { encoding: "utf8" });
    assert.equal(unknown.status, 1);
  });

  it("runs init --dry-run in a project", async () => {
    await write("package.json", `{ "name": "app" }`);
    await write("tsconfig.json", "{}");
    const run = spawnSync(process.execPath, [main, "init", "--dry-run"], { cwd: dir, encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
    assert.ok(run.stdout.includes("would be updated"));
    assert.ok(run.stdout.includes("Next: npm install"));
    assert.equal(await read("package.json"), `{ "name": "app" }`);
  });

  it("checks a project without any typerail configuration, and honors the baseline", async () => {
    await write("tsconfig.json", `{ "compilerOptions": { "strict": true, "target": "ES2022", "module": "NodeNext", "types": [] }, "include": ["*.ts"] }`);
    await write("index.ts", "export const loose = (value: unknown): string => value as string;\n");
    await write("eslint.config.js", "export default [];\n");

    const failing = spawnSync(process.execPath, [main, "check"], { cwd: dir, encoding: "utf8" });
    assert.equal(failing.status, 1, failing.stderr);
    assert.ok(failing.stdout.includes("TR201"));

    const recorded = spawnSync(process.execPath, [main, "check", "--update-baseline"], { cwd: dir, encoding: "utf8" });
    assert.equal(recorded.status, 0, recorded.stderr);
    assert.ok((await read(BASELINE_FILE)).includes('"TR201": 1'));

    const passing = spawnSync(process.execPath, [main, "check"], { cwd: dir, encoding: "utf8" });
    assert.equal(passing.status, 0, passing.stdout);
    assert.ok(passing.stdout.includes("1 more are in"), passing.stdout);

    await write("index.ts", "export const strict = (value: string): string => value;\n");
    const fixed = spawnSync(process.execPath, [main, "check"], { cwd: dir, encoding: "utf8" });
    assert.equal(fixed.status, 0, fixed.stdout);
    assert.ok(fixed.stdout.includes("is fixed"), fixed.stdout);
  });

  it("follows project references from a solution-style tsconfig", async () => {
    await write("tsconfig.json", `{ "files": [], "references": [{ "path": "./tsconfig.app.json" }] }`);
    await write("tsconfig.app.json", `{ "compilerOptions": { "strict": true, "target": "ES2022", "module": "NodeNext", "types": [] }, "include": ["src"] }`);
    await write("src/index.ts", "export const loose = (value: unknown): string => value as string;\n");
    const run = spawnSync(process.execPath, [main, "check"], { cwd: dir, encoding: "utf8" });
    assert.equal(run.status, 1, run.stderr);
    assert.ok(run.stdout.includes("TR201 src/index.ts"));
  });

  it("refuses to check a project whose dependencies are not installed", async () => {
    await write("package.json", `{ "name": "app", "dependencies": { "left-pad": "1.3.0" } }`);
    await write("tsconfig.json", `{ "include": ["*.ts"] }`);
    await write("index.ts", "export const x = 1;\n");
    const run = spawnSync(process.execPath, [main, "check"], { cwd: dir, encoding: "utf8" });
    assert.equal(run.status, 1);
    assert.ok(run.stderr.includes("dependencies are not installed"));
  });

  it("lowers unhandled promises to P1 in browser code", async () => {
    const floating = "async function save(): Promise<void> {}\nexport function run(): void {\n  save();\n}\n";
    const priorities = async (): Promise<Record<string, number>> => {
      const run = spawnSync(process.execPath, [main, "check", "--format", "json"], { cwd: dir, encoding: "utf8" });
      const parsed: unknown = JSON.parse(run.stdout);
      assert.ok(typeof parsed === "object" && parsed !== null && "findings" in parsed && Array.isArray(parsed.findings));
      const entries: [string, number][] = [];
      for (const item of parsed.findings) {
        assert.ok(typeof item === "object" && item !== null && "file" in item && "priority" in item && "code" in item);
        if (item.code === "TR501" && typeof item.file === "string" && typeof item.priority === "number") {
          entries.push([item.file, item.priority]);
        }
      }
      return Object.fromEntries(entries);
    };

    await write("tsconfig.json", `{ "compilerOptions": { "strict": true, "target": "ES2022", "module": "NodeNext", "types": [] }, "include": ["*.ts"] }`);
    await write("server.ts", floating);
    await write("client.ts", `"use client";\n${floating}`);
    assert.deepEqual(await priorities(), { "server.ts": 0, "client.ts": 1 });

    await write("tsconfig.json", `{ "compilerOptions": { "strict": true, "target": "ES2022", "module": "ESNext", "moduleResolution": "bundler", "lib": ["ES2022", "DOM"], "types": [] }, "include": ["*.ts"] }`);
    assert.deepEqual(await priorities(), { "server.ts": 1, "client.ts": 1 });

    await write("tsconfig.json", `{ "compilerOptions": { "strict": true, "target": "ES2022", "module": "ESNext", "moduleResolution": "bundler", "types": ["vite/client", "node"] }, "include": ["*.ts"] }`);
    await mkdir(join(dir, "node_modules/vite"), { recursive: true });
    await write("node_modules/vite/client.d.ts", "export {};\n");
    await write("node_modules/vite/package.json", `{ "name": "vite", "types": "client.d.ts" }`);
    assert.deepEqual(await priorities(), { "server.ts": 1, "client.ts": 1 });
  });
});
