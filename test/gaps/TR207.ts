function parse(text: string): number;
function parse(text: string): number | string {
  return text.trim();
}

export function proof(): string {
  return parse("42").toFixed();
}
