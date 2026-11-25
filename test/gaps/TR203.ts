export function proof(): string {
  const count: number = 1;
  // @ts-expect-error the value is a number at runtime
  const label: string = count;
  return label.toUpperCase();
}
