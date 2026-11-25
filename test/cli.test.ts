import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { AGENTS_END, AGENTS_START, applyInit, CHECK_SCRIPT, planInit, type InitReport } from "../src/cli/init.ts";
import { parseJsonc } from "../src/cli/jsonc.ts";
import { supportsSuppressionsApi } from "../src/cli/eslint-version.ts";

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

async function init(options: { dryRun?: boolean; force?: boolean } = {}): Promise<InitReport> {
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

const TSCONFIG_WITH_COMMENTS = `{
  // Node 22 base
  "extends": "@tsconfig/node22/tsconfig.json",
  "compilerOptions": {
    "outDir": "dist" /* build output */
  }
}
`;

describe("typerail init", () => {
  it("sets up a fresh project and keeps tsconfig comments", async () => {
    await write("package.json", `{\n  "name": "app",\n  "type": "module"\n}\n`);
    await write("tsconfig.json", TSCONFIG_WITH_COMMENTS);

    const report = await init();

    assert.deepEqual(statuses(report), {
      "tsconfig.json": "updated",
      "eslint.config.js": "created",
      "package.json": "updated",
      "AGENTS.md": "created",
      ".vscode/extensions.json": "created",
      ".vscode/settings.json": "created",
    });
    assert.deepEqual(report.missingPeers, ["typescript", "eslint", "typescript-eslint"]);

    const tsconfig = await read("tsconfig.json");
    assert.ok(tsconfig.includes("// Node 22 base"));
    assert.ok(tsconfig.includes("/* build output */"));
    const parsed = parseJsonc("tsconfig.json", tsconfig);
    assert.ok(parsed.ok);
    assert.deepEqual(parsed.value["extends"], ["@tsconfig/node22/tsconfig.json", "@wingravity/typerail/tsconfig.json"]);

    const pkg = parseJsonc("package.json", await read("package.json"));
    assert.ok(pkg.ok);
    assert.deepEqual(pkg.value["scripts"], { check: CHECK_SCRIPT });
    assert.deepEqual(pkg.value["devDependencies"], { "@wingravity/typerail": SPEC });
    assert.equal(pkg.value["dependencies"], undefined);

    assert.ok((await read("eslint.config.js")).includes('from "@wingravity/typerail/eslint"'));
    const settings = parseJsonc("settings.json", await read(".vscode/settings.json"));
    assert.ok(settings.ok);
    assert.deepEqual(settings.value, {
      "typescript.tsdk": "node_modules/typescript/lib",
      "eslint.options": { applySuppressions: true },
    });
    const extensions = parseJsonc("extensions.json", await read(".vscode/extensions.json"));
    assert.ok(extensions.ok);
    assert.deepEqual(extensions.value, { recommendations: ["dbaeumer.vscode-eslint"] });
  });

  it("changes nothing when run a second time", async () => {
    await write("package.json", `{ "name": "app", "type": "module" }`);
    await write("tsconfig.json", `{ "compilerOptions": {} }`);
    await init();
    const before = await read("tsconfig.json");

    const second = await init();

    assert.ok(second.changes.every((change) => change.status === "unchanged"));
    assert.equal(await read("tsconfig.json"), before);
    assert.deepEqual(second.notes, []);
  });

  it("writes nothing in a dry run", async () => {
    await write("package.json", `{ "name": "app" }`);
    await write("tsconfig.json", `{}`);

    const report = await init({ dryRun: true });

    assert.equal(statuses(report)["tsconfig.json"], "updated");
    assert.equal(await read("tsconfig.json"), "{}");
    assert.equal(await read("package.json"), `{ "name": "app" }`);
    await assert.rejects(read("eslint.config.mjs"));
  });

  it("uses eslint.config.mjs in CommonJS projects", async () => {
    await write("package.json", `{ "name": "app" }`);
    await write("tsconfig.json", `{}`);
    const report = await init();
    assert.equal(statuses(report)["eslint.config.mjs"], "created");
  });

  it("appends to an extends array with a trailing comma", async () => {
    await write("package.json", `{ "name": "app" }`);
    await write("tsconfig.json", `{\n  "extends": ["./base.json",],\n  "include": ["src"],\n}\n`);
    await init();
    const parsed = parseJsonc("tsconfig.json", await read("tsconfig.json"));
    assert.ok(parsed.ok);
    assert.deepEqual(parsed.value["extends"], ["./base.json", "@wingravity/typerail/tsconfig.json"]);
    assert.deepEqual(parsed.value["include"], ["src"]);
  });

  it("adds extends to a tsconfig with a trailing comma and no extends", async () => {
    await write("package.json", `{ "name": "app" }`);
    await write("tsconfig.json", `{\n  "include": ["src"],\n}\n`);
    await init();
    const parsed = parseJsonc("tsconfig.json", await read("tsconfig.json"));
    assert.ok(parsed.ok);
    assert.equal(parsed.value["extends"], "@wingravity/typerail/tsconfig.json");
  });

  it("leaves an existing ESLint config alone unless --force", async () => {
    await write("package.json", `{ "name": "app", "type": "module" }`);
    await write("tsconfig.json", `{}`);
    await write("eslint.config.js", "export default [];\n");

    const kept = await init();
    assert.equal(statuses(kept)["eslint.config.js"], "skipped");
    assert.equal(await read("eslint.config.js"), "export default [];\n");
    assert.ok(kept.notes.some((note) => note.includes("@wingravity/typerail/eslint")));

    const forced = await init({ force: true });
    assert.equal(statuses(forced)["eslint.config.js"], "updated");
    assert.ok((await read("eslint.config.js")).includes("@wingravity/typerail/eslint"));
  });

  it("merges into existing VS Code settings and keeps their comments", async () => {
    await write("package.json", `{ "name": "app" }`);
    await write("tsconfig.json", `{}`);
    await write(
      ".vscode/settings.json",
      `{\n  // team settings\n  "editor.formatOnSave": true,\n  "eslint.options": { "cache": true }\n}\n`,
    );
    await write(".vscode/extensions.json", `{ "recommendations": ["esbenp.prettier-vscode"] }`);
    await init();

    const settingsText = await read(".vscode/settings.json");
    assert.ok(settingsText.includes("// team settings"));
    const settings = parseJsonc("settings.json", settingsText);
    assert.ok(settings.ok);
    assert.equal(settings.value["editor.formatOnSave"], true);
    assert.deepEqual(settings.value["eslint.options"], { cache: true, applySuppressions: true });

    const extensions = parseJsonc("extensions.json", await read(".vscode/extensions.json"));
    assert.ok(extensions.ok);
    assert.deepEqual(extensions.value["recommendations"], ["esbenp.prettier-vscode", "dbaeumer.vscode-eslint"]);
  });

  it("keeps an existing check script and reports it", async () => {
    await write("package.json", `{ "name": "app", "scripts": { "check": "biome check" }, "devDependencies": { "eslint": "10.0.0" } }`);
    await write("tsconfig.json", `{}`);
    const report = await init();
    const pkg = parseJsonc("package.json", await read("package.json"));
    assert.ok(pkg.ok);
    assert.deepEqual(pkg.value["scripts"], { check: "biome check" });
    assert.ok(report.notes.some((note) => note.includes("Kept your existing")));
    assert.deepEqual(report.missingPeers, ["typescript", "typescript-eslint"]);
  });

  it("leaves typerail in dependencies and asks to move it", async () => {
    await write("package.json", `{ "name": "app", "dependencies": { "@wingravity/typerail": "${SPEC}" } }`);
    await write("tsconfig.json", `{}`);
    const report = await init();
    const pkg = parseJsonc("package.json", await read("package.json"));
    assert.ok(pkg.ok);
    assert.equal(pkg.value["devDependencies"], undefined);
    assert.ok(report.notes.some((note) => note.includes("Move it to devDependencies")));
  });

  it("skips a missing tsconfig and detects pnpm", async () => {
    await write("package.json", `{ "name": "app" }`);
    await write("pnpm-lock.yaml", "");
    const report = await init();
    assert.equal(statuses(report)["tsconfig.json"], "skipped");
    assert.equal(report.packageManager, "pnpm");
  });

  it("adds typerail instructions to an existing AGENTS.md once", async () => {
    await write("package.json", `{ "name": "app" }`);
    await write("tsconfig.json", `{}`);
    await write("AGENTS.md", "# Team rules\n\nUse tabs.\n");

    const first = await init();
    assert.equal(statuses(first)["AGENTS.md"], "updated");
    const agents = await read("AGENTS.md");
    assert.ok(agents.startsWith("# Team rules\n\nUse tabs.\n\n<!-- typerail:start -->"));
    assert.ok(agents.includes("npm run check"));

    const second = await init();
    assert.equal(statuses(second)["AGENTS.md"], "unchanged");
    assert.equal(await read("AGENTS.md"), agents);
  });

  it("replaces an outdated typerail section and keeps the rest", async () => {
    await write("package.json", `{ "name": "app" }`);
    await write("tsconfig.json", `{}`);
    await write("pnpm-lock.yaml", "");
    await write("AGENTS.md", `Before\n\n${AGENTS_START}\nold rules\n${AGENTS_END}\n\nAfter\n`);

    const report = await init();
    assert.equal(statuses(report)["AGENTS.md"], "updated");
    const agents = await read("AGENTS.md");
    assert.ok(agents.startsWith("Before\n\n<!-- typerail:start -->"));
    assert.ok(agents.endsWith(`${AGENTS_END}\n\nAfter\n`));
    assert.ok(!agents.includes("old rules"));
    assert.ok(agents.includes("pnpm run check"));
  });

  it("makes an existing CLAUDE.md import AGENTS.md, and never creates one", async () => {
    await write("package.json", `{ "name": "app" }`);
    await write("tsconfig.json", `{}`);
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

  it("leaves out the editor suppressions setting for ESLint older than 10.1", async () => {
    await write("package.json", `{ "name": "app", "devDependencies": { "eslint": "^9.39.2" } }`);
    await write("tsconfig.json", `{}`);
    const report = await init();
    const settings = parseJsonc("settings.json", await read(".vscode/settings.json"));
    assert.ok(settings.ok);
    assert.deepEqual(settings.value, { "typescript.tsdk": "node_modules/typescript/lib" });
    assert.ok(report.notes.some((note) => note.includes("ESLint 10.1.0 or later") && note.includes("^9.39.2")));
  });

  it("prefers the installed ESLint version over the declared range", async () => {
    await write("package.json", `{ "name": "app", "devDependencies": { "eslint": "^9.39.2" } }`);
    await write("node_modules/eslint/package.json", `{ "name": "eslint", "version": "10.15.0" }`);
    await write("tsconfig.json", `{}`);
    await init();
    const settings = parseJsonc("settings.json", await read(".vscode/settings.json"));
    assert.ok(settings.ok);
    assert.deepEqual(settings.value["eslint.options"], { applySuppressions: true });
  });

  it("fails without a package.json", async () => {
    const report = await planInit({ cwd: dir, packageSpec: SPEC });
    assert.ok(!report.ok && report.error.includes("No package.json"));
  });
});

describe("supportsSuppressionsApi", () => {
  it("accepts ESLint 10.1 and later only", () => {
    assert.equal(supportsSuppressionsApi("10.1.0"), true);
    assert.equal(supportsSuppressionsApi("10.15.0"), true);
    assert.equal(supportsSuppressionsApi("11.0.0"), true);
    assert.equal(supportsSuppressionsApi("^10.2.0"), true);
    assert.equal(supportsSuppressionsApi("10.0.0"), false);
    assert.equal(supportsSuppressionsApi("9.39.2"), false);
    assert.equal(supportsSuppressionsApi("^9.35.0 || ^10.0.0"), false);
    assert.equal(supportsSuppressionsApi("latest"), false);
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
    await write("tsconfig.json", `{}`);
    const run = spawnSync(process.execPath, [main, "init", "--dry-run"], { cwd: dir, encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
    assert.ok(run.stdout.includes("would be updated"));
    assert.ok(run.stdout.includes("Next: npm install -D typescript eslint typescript-eslint"));
    assert.equal(await read("tsconfig.json"), "{}");
  });
});
