interface User {
  name: string;
}

export function proof(): string {
  const raw: unknown = { id: 1 };
  const user = raw as User;
  return user.name.toUpperCase();
}
