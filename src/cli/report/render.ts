import { safeJsonStringify } from "../../internal/json.ts";
import { err, ok, type Result } from "../../internal/result.ts";
import { PRIORITY_DESCRIPTIONS, PRIORITY_TITLES, type Priority } from "./classify.ts";
import type { Finding, Report } from "./collect.ts";
import { docsUrl } from "../../gaps.ts";

const PRIORITIES: readonly Priority[] = [0, 1, 2, 3, 4];
const TOP_FILES = 10;

function label(priority: Priority): string {
  return `P${String(priority)}: ${PRIORITY_TITLES[priority]}`;
}

function oneLine(text: string): string {
  return text.replaceAll(/\s+/gu, " ").trim();
}

function location(finding: Finding): string {
  return `${finding.file}:${String(finding.line)}:${String(finding.column)}`;
}

function countBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const name = key(item);
    groups.set(name, [...(groups.get(name) ?? []), item]);
  }
  return groups;
}

export interface Summary {
  readonly production: Readonly<Record<string, number>>;
  readonly tests: Readonly<Record<string, number>>;
  readonly total: number;
}

export function summarize(findings: readonly Finding[]): Summary {
  const tally = (test: boolean): Record<string, number> =>
    Object.fromEntries(
      PRIORITIES.map((priority) => [
        `P${String(priority)}`,
        findings.filter((f) => f.test === test && f.priority === priority).length,
      ]),
    );
  return { production: tally(false), tests: tally(true), total: findings.length };
}

function ruleSections(findings: readonly Finding[], headingLevel: string): string[] {
  const lines: string[] = [];
  const byRule = [...countBy(findings, (f) => f.rule)].sort((a, b) => b[1].length - a[1].length);
  for (const [rule, group] of byRule) {
    const first = group[0];
    if (first === undefined) {
      continue;
    }
    const code = first.code === undefined ? "" : `${first.code} `;
    lines.push(`${headingLevel} ${code}\`${rule}\` (${String(group.length)})`, "");
    const docs = first.code === undefined ? "" : ` [About ${first.code}](${docsUrl(first.code)}).`;
    lines.push(`${first.why} **Fix:** ${first.fix}${docs}`, "");
    lines.push("<details>", `<summary>${String(group.length)} locations</summary>`, "");
    for (const f of group) {
      lines.push(`- \`${location(f)}\` ${oneLine(f.message)}`);
    }
    lines.push("", "</details>", "");
  }
  return lines;
}

export function renderMarkdown(report: Report, projectName: string): string {
  const production = report.findings.filter((f) => !f.test);
  const tests = report.findings.filter((f) => f.test);
  const summary = summarize(report.findings);
  const date = report.generatedAt.slice(0, 10);
  const lines: string[] = [
    "# typerail report",
    "",
    `Project \`${projectName}\`, generated on ${date}. ${String(report.findings.length)} findings: ${String(production.length)} in production code, ${String(tests.length)} in tests.`,
    "",
    "Findings are ordered by the worst realistic runtime consequence of each rule. Within each priority, production code comes before tests.",
    "",
    "## Summary",
    "",
    "| Priority | Production | Tests |",
    "|---|---:|---:|",
  ];
  for (const priority of PRIORITIES) {
    const key = `P${String(priority)}`;
    lines.push(
      `| ${label(priority)} | ${String(summary.production[key] ?? 0)} | ${String(summary.tests[key] ?? 0)} |`,
    );
  }
  lines.push(`| **Total** | **${String(production.length)}** | **${String(tests.length)}** |`, "");

  for (const priority of PRIORITIES) {
    lines.push(`- **${label(priority)}.** ${PRIORITY_DESCRIPTIONS[priority]}`);
  }
  lines.push("");

  const urgent = production.filter((f) => f.priority <= 2);
  if (urgent.length > 0) {
    lines.push(
      "## Files with the most P0 to P2 findings",
      "",
      "| File | P0 | P1 | P2 | Total |",
      "|---|---:|---:|---:|---:|",
    );
    const byFile = [...countBy(urgent, (f) => f.file)].sort((a, b) => b[1].length - a[1].length).slice(0, TOP_FILES);
    for (const [file, group] of byFile) {
      const count = (priority: Priority): string => String(group.filter((f) => f.priority === priority).length);
      lines.push(`| \`${file}\` | ${count(0)} | ${count(1)} | ${count(2)} | ${String(group.length)} |`);
    }
    lines.push("");
  }

  for (const priority of PRIORITIES) {
    const group = production.filter((f) => f.priority === priority);
    if (group.length === 0) {
      continue;
    }
    lines.push(`## ${label(priority)}`, "", PRIORITY_DESCRIPTIONS[priority], "", ...ruleSections(group, "###"));
  }

  if (tests.length > 0) {
    lines.push("## Tests", "", "Findings in test files, grouped by priority.", "");
    for (const priority of PRIORITIES) {
      const group = tests.filter((f) => f.priority === priority);
      if (group.length > 0) {
        lines.push(`### ${label(priority)}`, "", ...ruleSections(group, "####"));
      }
    }
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

export function renderJson(report: Report, limit?: number): Result<string, string> {
  const findings = limit === undefined ? report.findings : report.findings.slice(0, limit);
  const json = safeJsonStringify(
    {
      generatedAt: report.generatedAt,
      project: report.project,
      summary: summarize(report.findings),
      findings,
    },
    2,
  );
  return json.ok ? ok(`${json.value}\n`) : err(json.error.message);
}

export function renderFindings(findings: readonly Finding[]): string[] {
  return findings.flatMap((f, index) => [
    `${String(index + 1)}. [P${String(f.priority)}]${f.code === undefined ? "" : ` ${f.code}`} ${location(f)} ${f.rule}${f.test ? " (test)" : ""}`,
    `   ${oneLine(f.message)}`,
    `   Fix: ${f.fix}`,
    ...(f.code === undefined ? [] : [`   Docs: ${docsUrl(f.code)}`]),
  ]);
}

export function findingsCount(count: number): string {
  return `${String(count)} ${count === 1 ? "finding" : "findings"}`;
}

export function countsByPriority(findings: readonly Finding[]): string {
  const summary = summarize(findings);
  return PRIORITIES.map(
    (p) => `P${String(p)} ${String((summary.production[`P${String(p)}`] ?? 0) + (summary.tests[`P${String(p)}`] ?? 0))}`,
  ).join(", ");
}

export function renderNext(report: Report, limit: number): string {
  const shown = report.findings.slice(0, limit);
  const lines = [
    `typerail: ${findingsCount(report.findings.length)} (${countsByPriority(report.findings)}). Showing the first ${String(shown.length)}, highest priority first.`,
    "",
    ...renderFindings(shown),
  ];
  return `${lines.join("\n")}\n`;
}
