interface User { readonly id: string }

export class Service {
  client!: { send(): void }; // @expect typerail/no-definite-assignment
}

export function isUser(value: unknown): value is User { // @expect typerail/no-type-predicate
  return typeof value === "object" && value !== null;
}

export const present = [1, undefined].filter((n) => n !== undefined);

export function parse(text: string): number; // @expect typerail/no-overload-signature
export function parse(text: string): number | string {
  return text;
}

function parseAs<T>(text: string): T {
  return JSON.parse(text); // @expect @typescript-eslint/no-unsafe-return
}

export const user = parseAs<User>("{}"); // @expect typerail/no-return-type-argument

class Session {
  greet(): string {
    return "hi";
  }
}

export const cloned = structuredClone(new Session()); // @expect typerail/no-structured-clone-instance

enum Status { Pending, Complete }
export const forged = (raw: number): Status => raw; // @expect @typescript-eslint/no-unsafe-enum-assignment

class Account {
  constructor(readonly owner: string) {}
}
export const fake: Account = { owner: "ada" }; // @expect @typescript-eslint/no-unsafe-class-instance-assignment
