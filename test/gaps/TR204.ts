const settings = new Map<string, string>();

export function proof(): string {
  const theme = settings.get("theme")!;
  return theme.toUpperCase();
}
