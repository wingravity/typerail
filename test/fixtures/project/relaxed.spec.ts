import { describe, it } from "node:test";
import { execSync } from "node:child_process";

declare const response: { body: any }; // @expect @typescript-eslint/no-explicit-any

describe("suite", () => {
  it("relaxes assertions and unsafe any", async () => {
    const id: string = response.body.user.id;
    const asserted = JSON.parse("{}") as { ok: boolean };
    const name: string | undefined = asserted.ok ? id : undefined;
    if (name) {
      throw new Error(execSync("true").toString());
    }
    await Promise.resolve(name!);
  });
});

const later = (): Promise<void> => Promise.resolve();
later(); // @expect @typescript-eslint/no-floating-promises
export const loose = (a: string, b: string): boolean => a == b;
