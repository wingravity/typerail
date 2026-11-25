export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

export type Result<T, E> = Ok<T> | Err<E>;

export type AsyncResult<T, E> = Promise<Result<T, E>>;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

export function attempt<T, E>(fn: () => T, toError: (cause: unknown) => E): Result<T, E> {
  try {
    return ok(fn());
  } catch (cause) {
    return err(toError(cause));
  }
}

export async function attemptAsync<T, E>(
  fn: () => T | PromiseLike<T>,
  toError: (cause: unknown) => E,
): AsyncResult<T, E> {
  try {
    return ok(await fn());
  } catch (cause) {
    return err(toError(cause));
  }
}
