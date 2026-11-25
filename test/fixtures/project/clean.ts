interface User {
  readonly id: number;
  readonly name: string;
}

type Shape = { readonly kind: "circle"; readonly radius: number } | { readonly kind: "square"; readonly side: number };

export function parseUser(text: string): User {
  const value: unknown = JSON.parse(text);
  if (typeof value === "object" && value !== null && "id" in value && "name" in value) {
    const { id, name } = value;
    if (typeof id === "number" && typeof name === "string") {
      return { id, name };
    }
  }
  throw new Error("not a user");
}

export function area(shape: Shape): number {
  switch (shape.kind) {
    case "circle":
      return Math.PI * shape.radius ** 2;
    case "square":
      return shape.side ** 2;
  }
}

export function firstName(users: readonly User[]): string {
  const first = users[0];
  return first === undefined ? "nobody" : first.name;
}

export async function loadAll(load: (id: number) => Promise<User>, ids: readonly number[]): Promise<User[]> {
  return Promise.all(ids.map((id) => load(id)));
}
