import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { typerailRules } from "../src/eslint/index.ts";
import { classifyEslint, classifyTypeScript, isClassifiedRule } from "../src/cli/report/classify.ts";
import { buildReport, type Report } from "../src/cli/report/collect.ts";
import { renderJson, renderMarkdown, renderNext } from "../src/cli/report/render.ts";

const fixtureDir = resolve(import.meta.dirname, "fixtures/project");

async function report(tsconfig?: string): Promise<Report> {
  const built = await buildReport({ cwd: fixtureDir, tsconfig });
  assert.ok(built.ok, built.ok ? "" : built.error);
  return built.value;
}

describe("classification", () => {
  it("gives every rule typerail enables a priority", () => {
    const enabled = Object.keys(typerailRules());
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
    assert.ok(full.findings.every((f) => f.fix.length > 0 && f.why.length > 0));
  });

  it("ignores eslint-disable comments", () => {
    assert.ok(full.findings.some((f) => f.file === "lying.ts" && f.line === 11 && f.rule === "@typescript-eslint/no-explicit-any"));
    assert.ok(!full.findings.some((f) => f.rule === "inline-disable"));
  });

  it("applies typerail's compiler flags even when the project's tsconfig turns them off", async () => {
    const weakened = await report("tsconfig.weak.json");
    assert.ok(weakened.findings.some((f) => f.file === "compiler.ts" && f.rule === "TS2322"));
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

  it("returns an error for a missing tsconfig", async () => {
    const built = await buildReport({ cwd: fixtureDir, tsconfig: "missing.json" });
    assert.ok(!built.ok);
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
