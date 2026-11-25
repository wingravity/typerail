export function thrower(): never {
  throw new Error("x");
}

export function catcher(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (cause) {
    return cause instanceof Error ? cause.message : "unknown";
  }
}

export const rejected = (): Promise<never> => Promise.reject(new Error("x"));

export const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export function countdown(n: number): number {
  let i = n;
  while (i > 0) {
    i--;
  }
  return i;
}

export function* naturals(): Generator<number> {
  yield 1;
}

export const loose = (a: string, b: string): boolean => a == b;
export const greeting = (name: string): string => (name ? name : "anonymous");
export const some = (n: number): string => (n ? "some" : "none");
export const url = new URL("https://example.com");
export const request = (): Promise<Response> => fetch("https://example.com");
export const dynamic: Record<string, string> = {};
export const readDynamic = (): string | undefined => dynamic.key;
