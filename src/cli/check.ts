import { parseArgs } from "node:util";
import { safeJsonStringify } from "../internal/json.ts";
import { applyBaseline, BASELINE_FILE, readBaseline, writeBaseline } from "./baseline.ts";
import { buildReport } from "./report/collect.ts";
import { countsByPriority, findingsCount, renderFindings } from "./report/render.ts";

export const CHECK_USAGE = `Usage: typerail check [options]

Type-checks the project with typerail's compiler flags and runs typerail's rules.
The files are the ones the tsconfig includes. The project's own tsconfig flags
and ESLint configuration cannot weaken the check. Exits with code 1 when there
are findings that are not in the baseline.

Options:
  --project <tsconfig>   tsconfig that defines the files to check (default: tsconfig.json)
  --update-baseline      Record all current findings in ${BASELINE_FILE} and exit with code 0
  --format text|json     Output format (default: text)
  -h, --help             Show this help`;

export async function runCheck(args: readonly string[]): Promise<number> {
  const parsed = parseArgs({
    args: [...args],
    options: {
      project: { type: "string", default: "tsconfig.json" },
      "update-baseline": { type: "boolean", default: false },
      format: { type: "string", default: "text" },
      help: { type: "boolean", short: "h", default: false },
    },
    strict: false,
  });
  const values = parsed.values;
  if (values.help === true) {
    console.log(CHECK_USAGE);
    return 0;
  }
  if (values.format !== "text" && values.format !== "json") {
    console.error(`typerail check: unknown format ${String(values.format)}\n\n${CHECK_USAGE}`);
    return 1;
  }

  const cwd = process.cwd();
  const report = await buildReport({ cwd, tsconfig: typeof values.project === "string" ? values.project : undefined });
  if (!report.ok) {
    console.error(`typerail check: ${report.error}`);
    return 1;
  }
  const findings = report.value.findings;
  for (const warning of report.value.warnings) {
    console.error(`typerail check: warning: ${warning}`);
  }

  if (values["update-baseline"] === true) {
    const written = await writeBaseline(cwd, findings);
    if (!written.ok) {
      console.error(`typerail check: could not write ${BASELINE_FILE}: ${written.error}`);
      return 1;
    }
    console.log(`typerail check: recorded ${findingsCount(written.value)} in ${BASELINE_FILE}.`);
    return 0;
  }

  const baseline = await readBaseline(cwd);
  if (!baseline.ok) {
    console.error(`typerail check: ${baseline.error}`);
    return 1;
  }
  const result = applyBaseline(findings, baseline.value);

  if (values.format === "json") {
    const json = safeJsonStringify({ findings: result.fresh, baselined: result.baselined, fixed: result.fixed }, 2);
    if (!json.ok) {
      console.error(`typerail check: ${json.error.message}`);
      return 1;
    }
    process.stdout.write(`${json.value}\n`);
    return result.fresh.length > 0 ? 1 : 0;
  }

  const inBaseline = result.baselined > 0 ? ` ${String(result.baselined)} more are in ${BASELINE_FILE}.` : "";
  if (result.fresh.length === 0) {
    console.log(`typerail check: no findings.${inBaseline}`);
  } else {
    console.log(`typerail check: ${findingsCount(result.fresh.length)} (${countsByPriority(result.fresh)}).${inBaseline}\n`);
    console.log(renderFindings(result.fresh).join("\n"));
  }
  if (result.fixed > 0) {
    console.log(
      `\n${findingsCount(result.fixed)} recorded in ${BASELINE_FILE} ${result.fixed === 1 ? "is" : "are"} fixed. Run "typerail check --update-baseline" to remove them from the baseline.`,
    );
  }
  return result.fresh.length > 0 ? 1 : 0;
}
