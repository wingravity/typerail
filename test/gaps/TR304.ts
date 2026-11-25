class Session {
  constructor(readonly user: string) {}

  greeting(): string {
    return `Hello, ${this.user}`;
  }
}

export function proof(): string {
  const copy = structuredClone(new Session("ada"));
  return copy.greeting();
}
