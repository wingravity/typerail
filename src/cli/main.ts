#!/usr/bin/env node
import { parseArgs } from "node:util";
import { join } from "node:path";
import { readTextFile } from "../internal/fs.ts";
import { safeJsonParse } from "../internal/json.ts";
import { asRecord } from "./jsonc.ts";
import { applyInit, installCommand, planInit, type InitReport } from "./init.ts";

const USAGE = `Usage: typerail <command> [options]

Commands:
  check       Check the project and fail on findings that are not in the baseline
  report      Write a prioritized report of all findings
  init        Add typerail to the current project

Options for init:
  --dry-run   Show what would change without writing anything

Run "typerail check --help" or "typerail report --help" for their options.
  -h, --help  Show this help`;

const FALLBACK_SPEC = "latest";

async function packageSpec(): Promise<string> {
  const text = await readTextFile(join(import.meta.dirname, "../../package.json"));
  const pkg = text.ok ? safeJsonParse(text.value) : undefined;
  const record = pkg?.ok === true ? asRecord(pkg.value) : undefined;
  if (record === undefined) {
    return FALLBACK_SPEC;
  }
  const { version } = record;
  return typeof version === "string" ? `^${version}` : FALLBACK_SPEC;
}

function printReport(report: InitReport, dryRun: boolean): void {
  const verb = (status: string): string => (dryRun && (status === "created" || status === "updated") ? `would be ${status}` : status);
  const width = Math.max(...report.changes.map((change) => change.file.length));
  console.log(dryRun ? "typerail init (dry run, nothing written)\n" : "typerail init\n");
  for (const change of report.changes) {
    console.log(`  ${verb(change.status).padEnd(16)} ${change.file.padEnd(width)}  ${change.detail}`);
  }
  for (const note of report.notes) {
    console.log(`\n${note}`);
  }
  console.log(`\nNext: ${installCommand(report.packageManager)}`);
  console.log(`Then: ${report.packageManager} run typerail`);
}

async function init(args: readonly string[]): Promise<number> {
  const parsed = parseArgs({
    args: [...args],
    options: {
      "dry-run": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    strict: false,
  });
  if (parsed.values.help === true) {
    console.log(USAGE);
    return 0;
  }
  const dryRun = parsed.values["dry-run"] === true;
  const cwd = process.cwd();
  const report = await planInit({ cwd, packageSpec: await packageSpec(), dryRun });
  if (!report.ok) {
    console.error(`typerail init: ${report.error}`);
    return 1;
  }
  if (!dryRun) {
    const applied = await applyInit(cwd, report.value);
    if (!applied.ok) {
      console.error(`typerail init: could not write ${applied.error.path}: ${applied.error.message}`);
      return 1;
    }
  }
  printReport(report.value, dryRun);
  return 0;
}

async function main(argv: readonly string[]): Promise<number> {
  const [command, ...rest] = argv;
  switch (command) {
    case "init":
      return init(rest);
    case "check": {
      const { runCheck } = await import("./check.ts");
      return runCheck(rest);
    }
    case "report": {
      const { runReport } = await import("./report/command.ts");
      return runReport(rest);
    }
    case undefined:
    case "-h":
    case "--help":
      console.log(USAGE);
      return 0;
    default:
      console.error(`Unknown command: ${command}\n\n${USAGE}`);
      return 1;
  }
}

process.exitCode = await main(process.argv.slice(2));
