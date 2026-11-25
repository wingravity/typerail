export interface TaggedError<K extends string> {
  readonly kind: K;
  readonly message: string;
  readonly cause?: unknown;
}

export function taggedError<K extends string>(kind: K, message: string, cause?: unknown): TaggedError<K> {
  return cause === undefined ? { kind, message } : { kind, message, cause };
}

export function describeCause(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.message;
  }
  if (typeof cause === "string") {
    return cause;
  }
  return "unknown error";
}
