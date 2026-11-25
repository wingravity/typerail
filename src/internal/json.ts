import { attempt, err, ok, type Result } from "./result.ts";
import { describeCause, taggedError, type TaggedError } from "./error.ts";

export type JsonParseError =
  | TaggedError<"JsonTooLarge">
  | TaggedError<"JsonTooDeep">
  | TaggedError<"JsonSyntaxError">;

export type JsonStringifyError = TaggedError<"JsonStringifyError"> | TaggedError<"JsonNotSerializable">;

export interface JsonLimits {
  readonly maxLength?: number | undefined;
  readonly maxDepth?: number | undefined;
}

export const DEFAULT_JSON_MAX_LENGTH = 1_000_000;
export const DEFAULT_JSON_MAX_DEPTH = 64;

const QUOTE = "\"".charCodeAt(0);
const BACKSLASH = "\\".charCodeAt(0);
const OPEN_BRACE = "{".charCodeAt(0);
const CLOSE_BRACE = "}".charCodeAt(0);
const OPEN_BRACKET = "[".charCodeAt(0);
const CLOSE_BRACKET = "]".charCodeAt(0);

export function jsonNestingDepth(text: string): number {
  let depth = 0;
  let maxDepth = 0;
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (inString) {
      if (c === BACKSLASH) {
        i++;
      } else if (c === QUOTE) {
        inString = false;
      }
    } else if (c === QUOTE) {
      inString = true;
    } else if (c === OPEN_BRACE || c === OPEN_BRACKET) {
      depth++;
      maxDepth = Math.max(maxDepth, depth);
    } else if (c === CLOSE_BRACE || c === CLOSE_BRACKET) {
      depth--;
    }
  }
  return maxDepth;
}

export function safeJsonParse(text: string, limits: JsonLimits = {}): Result<unknown, JsonParseError> {
  const maxLength = limits.maxLength ?? DEFAULT_JSON_MAX_LENGTH;
  const maxDepth = limits.maxDepth ?? DEFAULT_JSON_MAX_DEPTH;
  if (text.length > maxLength) {
    return err(taggedError("JsonTooLarge", `JSON input is ${String(text.length)} chars, limit is ${String(maxLength)}`));
  }
  const depth = jsonNestingDepth(text);
  if (depth > maxDepth) {
    return err(taggedError("JsonTooDeep", `JSON nesting depth ${String(depth)} exceeds limit ${String(maxDepth)}`));
  }
  return attempt(
    (): unknown => JSON.parse(text),
    (cause) => taggedError("JsonSyntaxError", describeCause(cause), cause),
  );
}

export function safeJsonStringify(value: unknown, indent?: number): Result<string, JsonStringifyError> {
  const result = attempt(
    (): string | undefined => JSON.stringify(value, null, indent),
    (cause): JsonStringifyError => taggedError("JsonStringifyError", describeCause(cause), cause),
  );
  if (!result.ok) {
    return result;
  }
  if (result.value === undefined) {
    return err(taggedError("JsonNotSerializable", `a value of type ${typeof value} has no JSON representation`));
  }
  return ok(result.value);
}
