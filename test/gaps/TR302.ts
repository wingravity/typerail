class Session {
  constructor(readonly user: string) {}
}

function describe(value: Session | string): string {
  if (value instanceof Session) {
    return value.user;
  }
  return value.toUpperCase();
}

export function proof(): string {
  const session: Session = { user: "ada" };
  return describe(session);
}
