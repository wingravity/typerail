import { loadUser } from "./TR209-lib.js";

export function proof(): string {
  return loadUser().name.toUpperCase();
}
