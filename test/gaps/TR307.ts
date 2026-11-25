import { Mode, run } from "./TR307-lib.js";

export function proof(): string {
  return run(Mode.Fast);
}
