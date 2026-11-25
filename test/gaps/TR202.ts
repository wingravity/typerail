function load(): any {
  return { count: "many" };
}

export function proof(): string {
  const total: number = load().count;
  return total.toFixed();
}
