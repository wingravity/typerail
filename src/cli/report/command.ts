import { parseArgs } from "node:util";
import { basename, resolve } from "node:path";
import { writeTextFile } from "../../internal/fs.ts";
import { buildReport } from "./collect.ts";
import { renderJson, renderMarkdown, renderNext, summarize } from "./render.ts";

export const REPORT_USAGE = `Usage: typerail report [options]

Runs the TypeScript compiler and ESLint and groups every finding by priority.

Options:
  --format md|json         Output format (default: md)
  --out <file>             Output file (default: typerail-report.md for md, standard output for json)
  --next <n>               Print only the first n findings, highest priority first, to standard output
  --project <tsconfig>     tsconfig to type-check (default: tsconfig.json)
  --respect-suppressions   Leave out findings recorded in eslint-suppressions.json
  -h, --help               Show this help`;

const DEFAULT_MARKDOWN_FILE = "typerail-report.md";

export async function runReport(args: readonly string[]): Promise<number> {
  const parsed = parseArgs({
    args: [...args],
    options: {
      format: { type: "string", default: "md" },
      out: { type: "string" },
      next: { type: "string" },
      project: { type: "string", default: "tsconfig.json" },
      "respect-suppressions": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    strict: false,
  });
  const values = parsed.values;
  if (values.help === true) {
    console.log(REPORT_USAGE);
    return 0;
  }
  const format = values.format;
  if (format !== "md" && format !== "json") {
    console.error(`typerail report: unknown format ${String(format)}\n\n${REPORT_USAGE}`);
    return 1;
  }
  const next = typeof values.next === "string" ? Number(values.next) : undefined;
  if (next !== undefined && (!Number.isInteger(next) || next < 1)) {
    console.error("typerail report: --next must be a positive whole number");
    return 1;
  }

  const cwd = process.cwd();
  const report = await buildReport({
    cwd,
    tsconfig: typeof values.project === "string" ? values.project : undefined,
    respectSuppressions: values["respect-suppressions"] === true,
  });
  if (!report.ok) {
    console.error(`typerail report: ${report.error}`);
    return 1;
  }

  const out = typeof values.out === "string" ? values.out : undefined;
  if (next !== undefined && format === "md") {
    process.stdout.write(renderNext(report.value, next));
    return 0;
  }

  if (format === "json") {
    const json = renderJson(report.value, next);
    if (!json.ok) {
      console.error(`typerail report: ${json.error}`);
      return 1;
    }
    if (out === undefined) {
      process.stdout.write(json.value);
      return 0;
    }
    const written = await writeTextFile(resolve(cwd, out), json.value);
    if (!written.ok) {
      console.error(`typerail report: could not write ${out}: ${written.error.message}`);
      return 1;
    }
    console.log(`typerail report: wrote ${out}`);
    return 0;
  }

  const file = out ?? DEFAULT_MARKDOWN_FILE;
  const written = await writeTextFile(resolve(cwd, file), renderMarkdown(report.value, basename(cwd)));
  if (!written.ok) {
    console.error(`typerail report: could not write ${file}: ${written.error.message}`);
    return 1;
  }
  const summary = summarize(report.value.findings);
  const counts = (record: Readonly<Record<string, number>>): string =>
    Object.entries(record)
      .map(([priority, count]) => `${priority} ${String(count)}`)
      .join(", ");
  console.log(`typerail report: wrote ${file}`);
  console.log(`  production: ${counts(summary.production)}`);
  console.log(`  tests:      ${counts(summary.tests)}`);
  if (report.value.configChanges.length > 0) {
    console.log(`  configuration weakens typerail in ${String(report.value.configChanges.length)} places (see the report)`);
  }
  return 0;
}
