export function proof(): string[] {
  const names = ["ada", "grace"];
  delete names[0];
  const upper: string[] = [];
  for (const name of names) {
    upper.push(name.toUpperCase());
  }
  return upper;
}
