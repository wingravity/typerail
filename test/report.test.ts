import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import type { Linter } from "eslint";
import { typerail } from "../src/eslint/index.ts";
import { classifyEslint, classifyTypeScript, isClassifiedRule } from "../src/cli/report/classify.ts";
import { buildReport, expectedRuleSeverities, type Report } from "../src/cli/report/collect.ts";
import { renderJson, renderMarkdown, renderNext } from "../src/cli/report/render.ts";

const fixtureDir = resolve(import.meta.dirname, "fixtures/project");

function config(extra: Linter.Config[] = []): Linter.Config[] {
  const base = typerail({ tsconfigRootDir: fixtureDir }) as unknown as Linter.Config[];
  return [...base, ...extra];
}

async function report(extra: Linter.Config[] = [], tsconfig?: string): Promise<Report> {
  const built = await buildReport({
    cwd: fixtureDir,
    tsconfig,
    eslintOptions: { overrideConfigFile: true, overrideConfig: config(extra) },
  });
  assert.ok(built.ok, built.ok ? "" : built.error);
  return built.value;
}

describe("classification", () => {
  it("gives every rule typerail enables a priority", () => {
    const enabled = [...expectedRuleSeverities()].filter(([, severity]) => severity === 2).map(([rule]) => rule);
    assert.ok(enabled.length > 10);
    assert.deepEqual(enabled.filter((rule) => !isClassifiedRule(rule)), []);
  });

  it("ranks rules from the project's own configuration last", () => {
    assert.equal(classifyEslint("eqeqeq").priority, 4);
    assert.ok(!isClassifiedRule("@typescript-eslint/strict-boolean-expressions"));
  });

  it("orders compiler errors by consequence", () => {
    assert.equal(classifyTypeScript(2532).priority, 2);
    assert.equal(classifyTypeScript(7030).priority, 1);
    assert.equal(classifyTypeScript(2882).priority, 0);
    assert.equal(classifyTypeScript(2882).code, "TR606");
    assert.equal(classifyTypeScript(2532).code, undefined);
    assert.equal(classifyTypeScript(1149).priority, 0);
    assert.equal(classifyTypeScript(4111).priority, 4);
    assert.equal(classifyTypeScript(99999).priority, 2);
  });
});

describe("buildReport", () => {
  let full: Report;

  before(async () => {
    full = await report();
  });

  it("collects compiler and lint findings with priorities and fixes", () => {
    const find = (file: string, rule: string) => full.findings.find((f) => f.file === file && f.rule === rule);
    assert.equal(find("compiler.ts", "TS2322")?.priority, 2);
    assert.equal(find("correctness.ts", "@typescript-eslint/no-floating-promises")?.priority, 0);
    assert.equal(find("correctness.ts", "typerail/no-mutable-array-widening")?.priority, 1);
    assert.equal(find("correctness.ts", "@typescript-eslint/unbound-method")?.priority, 2);
    assert.equal(find("lying.ts", "inline-disable")?.priority, 4);
    assert.ok(full.findings.every((f) => f.fix.length > 0 && f.why.length > 0));
  });

  it("reports nothing for style choices such as throw, loops and loose equality", () => {
    assert.deepEqual(full.findings.filter((f) => f.file === "style.ts" || f.file === "clean.ts"), []);
  });

  it("marks test files and sorts production first, then by priority", () => {
    const spec = full.findings.filter((f) => f.file === "relaxed.spec.ts");
    assert.ok(spec.length > 0 && spec.every((f) => f.test));
    const firstTest = full.findings.findIndex((f) => f.test);
    assert.ok(full.findings.slice(firstTest).every((f) => f.test));
    const production = full.findings.slice(0, firstTest).map((f) => f.priority);
    assert.deepEqual(production, [...production].sort((a, b) => a - b));
  });

  it("reports no configuration changes for the typerail defaults", () => {
    assert.deepEqual(full.configChanges, []);
  });

  it("reports rules and compiler flags the project weakens", async () => {
    const weakened = await report(
      [{ files: ["**/*.ts"], rules: { "@typescript-eslint/no-explicit-any": "off", "@typescript-eslint/no-floating-promises": "warn" } }],
      "tsconfig.weak.json",
    );
    assert.deepEqual(
      weakened.configChanges.map((c) => `${c.setting}=${c.actual}`).sort(),
      [
        "@typescript-eslint/no-explicit-any=off",
        "@typescript-eslint/no-floating-promises=warn",
        "tsconfig: noUncheckedIndexedAccess=false",
      ],
    );
    assert.ok(!weakened.findings.some((f) => f.rule === "@typescript-eslint/no-explicit-any"));
  });

  it("can leave out suppressed findings", async () => {
    const built = await buildReport({
      cwd: fixtureDir,
      respectSuppressions: true,
      eslintOptions: { overrideConfigFile: true, overrideConfig: config() },
    });
    assert.ok(built.ok, built.ok ? "" : built.error);
    assert.equal(built.value.findings.length, full.findings.length);
  });

  it("returns an error instead of throwing when ESLint cannot start", async () => {
    const built = await buildReport({ cwd: fixtureDir, eslintOptions: { overrideConfigFile: 42 as unknown as string } });
    assert.ok(!built.ok && built.error.startsWith("ESLint could not start"));
  });

  it("renders Markdown, JSON and the next-findings list", () => {
    const markdown = renderMarkdown(full, "project");
    assert.ok(markdown.startsWith("# typerail report"));
    assert.ok(markdown.includes("## P0: Process can go down"));
    assert.ok(markdown.includes("## Tests"));

    const json = renderJson(full, 3);
    assert.ok(json.ok);
    const parsed: unknown = JSON.parse(json.value);
    assert.ok(typeof parsed === "object" && parsed !== null && "findings" in parsed && Array.isArray(parsed.findings));
    assert.equal(parsed.findings.length, 3);

    const next = renderNext(full, 2);
    assert.ok(next.includes("Showing the first 2"));
    assert.ok(next.includes("1. [P0]"));
    assert.ok(next.includes("   Fix: "));
    assert.ok(!next.includes("3. ["));
  });
});
