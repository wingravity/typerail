interface User {
  name: string;
}

function parseAs<T>(text: string): T {
  return JSON.parse(text);
}

export function proof(): string {
  const user = parseAs<User>('{"id":1}');
  return user.name.toUpperCase();
}
