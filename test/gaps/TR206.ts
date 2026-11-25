interface User {
  id: string;
}

function isUser(value: unknown): value is User {
  return typeof value === "object" && value !== null;
}

export function proof(): string {
  const value: unknown = { id: 42 };
  return isUser(value) ? value.id.toUpperCase() : "";
}
