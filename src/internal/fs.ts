import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { attemptAsync, err, type AsyncResult } from "./result.ts";
import { describeCause, type TaggedError } from "./error.ts";

export interface FsError extends TaggedError<"FsError"> {
  readonly code: string;
  readonly path: string;
}

export interface FileTooLargeError extends TaggedError<"FileTooLarge"> {
  readonly path: string;
  readonly size: number;
}

export interface FileLimits {
  readonly maxBytes?: number | undefined;
}

export const DEFAULT_MAX_FILE_BYTES = 10_000_000;

function errorCode(cause: unknown): string {
  return cause instanceof Error && "code" in cause && typeof cause.code === "string" ? cause.code : "UNKNOWN";
}

function toFsError(path: string): (cause: unknown) => FsError {
  return (cause) => ({ kind: "FsError", code: errorCode(cause), path, message: describeCause(cause), cause });
}

export async function readTextFile(
  path: string,
  limits: FileLimits = {},
): AsyncResult<string, FsError | FileTooLargeError> {
  const maxBytes = limits.maxBytes ?? DEFAULT_MAX_FILE_BYTES;
  const info = await attemptAsync(() => stat(path), toFsError(path));
  if (!info.ok) {
    return info;
  }
  if (info.value.size > maxBytes) {
    return err({
      kind: "FileTooLarge",
      path,
      size: info.value.size,
      message: `${path} is ${String(info.value.size)} bytes, limit is ${String(maxBytes)}`,
    });
  }
  return attemptAsync(() => readFile(path, "utf8"), toFsError(path));
}

export function writeTextFile(path: string, content: string): AsyncResult<void, FsError> {
  return attemptAsync(() => writeFile(path, content, "utf8"), toFsError(path));
}

export function ensureDir(path: string): AsyncResult<void, FsError> {
  return attemptAsync(async () => {
    await mkdir(path, { recursive: true });
  }, toFsError(path));
}
