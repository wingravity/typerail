import { join } from "node:path";
import { err, ok, type AsyncResult, type Result } from "../internal/result.ts";
import { readTextFile, writeTextFile } from "../internal/fs.ts";
import { safeJsonParse, safeJsonStringify } from "../internal/json.ts";
import { asRecord } from "./jsonc.ts";
import type { Finding } from "./report/collect.ts";

export const BASELINE_FILE = "typerail-baseline.json";

export type Counts = Readonly<Record<string, Readonly<Record<string, number>>>>;

export interface BaselineResult {
  readonly fresh: readonly Finding[];
  readonly baselined: number;
  readonly fixed: number;
}

export function baselineKey(finding: Finding): string {
  return finding.code ?? finding.rule;
}

export function countFindings(findings: readonly Finding[]): Counts {
  const counts: Record<string, Record<string, number>> = {};
  for (const finding of findings) {
    const perFile = counts[finding.file] ?? {};
    const key = baselineKey(finding);
    perFile[key] = (perFile[key] ?? 0) + 1;
    counts[finding.file] = perFile;
  }
  return counts;
}

export function applyBaseline(findings: readonly Finding[], baseline: Counts): BaselineResult {
  const used: Record<string, number> = {};
  const fresh: Finding[] = [];
  let baselined = 0;
  for (const finding of findings) {
    const slot = `${finding.file}\u0000${baselineKey(finding)}`;
    const allowed = baseline[finding.file]?.[baselineKey(finding)] ?? 0;
    const taken = used[slot] ?? 0;
    if (taken < allowed) {
      used[slot] = taken + 1;
      baselined += 1;
    } else {
      fresh.push(finding);
    }
  }
  const recorded = Object.values(baseline).flatMap((perFile) => Object.values(perFile)).reduce((sum, n) => sum + n, 0);
  return { fresh, baselined, fixed: recorded - baselined };
}

function parseCounts(text: string): Result<Counts, string> {
  const parsed = safeJsonParse(text);
  const root = parsed.ok ? asRecord(parsed.value) : undefined;
  const files = root === undefined ? undefined : asRecord(root["files"]);
  if (files === undefined) {
    return err(`${BASELINE_FILE} is not a typerail baseline`);
  }
  const counts: Record<string, Record<string, number>> = {};
  for (const [file, value] of Object.entries(files)) {
    const perFile: Record<string, number> = {};
    for (const [key, count] of Object.entries(asRecord(value) ?? {})) {
      if (typeof count === "number" && Number.isInteger(count) && count > 0) {
        perFile[key] = count;
      }
    }
    counts[file] = perFile;
  }
  return ok(counts);
}

export async function readBaseline(cwd: string): AsyncResult<Counts, string> {
  const text = await readTextFile(join(cwd, BASELINE_FILE));
  if (!text.ok) {
    return text.error.kind === "FsError" && text.error.code === "ENOENT" ? ok({}) : err(text.error.message);
  }
  return parseCounts(text.value);
}

function sorted<T>(record: Readonly<Record<string, T>>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
}

export async function writeBaseline(cwd: string, findings: readonly Finding[]): AsyncResult<number, string> {
  const counts = countFindings(findings);
  const files = sorted(Object.fromEntries(Object.entries(counts).map(([file, perFile]) => [file, sorted(perFile)])));
  const json = safeJsonStringify({ version: 1, files }, 2);
  if (!json.ok) {
    return err(json.error.message);
  }
  const written = await writeTextFile(join(cwd, BASELINE_FILE), `${json.value}\n`);
  return written.ok ? ok(findings.length) : err(written.error.message);
}
