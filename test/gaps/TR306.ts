interface Label {
  text: string;
}

class Label {}

export function proof(): string {
  return new Label().text.toUpperCase();
}
