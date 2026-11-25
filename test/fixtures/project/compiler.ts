const list: number[] = [1];
export const first: number = list[0]; // @expect TS2322

interface Options {
  name?: string;
}
export const options: Options = { name: undefined }; // @expect TS2375

export function implicitReturn(flag: boolean): number | undefined {
  if (flag) {
    return 1;
  }
}

export function fallthrough(n: 1 | 2): number {
  let total = 0;
  switch (n) {
    case 1: // @expect TS7029
      total += 1;
    case 2:
      total += 2;
  }
  return total;
}

export function caught(run: () => void): string {
  try {
    run();
    return "";
  } catch (e) {
    return e.message; // @expect TS18046 @typescript-eslint/no-unsafe-return
  }
}

import "./missing-polyfill.ts"; // @expect TS2882
