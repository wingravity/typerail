type Shape = { kind: "circle"; radius: number } | { kind: "square"; side: number };

function describe(shape: Shape): string {
  let text = "unknown shape";
  switch (shape.kind) {
    case "circle":
      text = `circle of radius ${String(shape.radius)}`;
      break;
  }
  return text;
}

export function proof(): { expected: string; actual: string } {
  return { expected: "square of side 2", actual: describe({ kind: "square", side: 2 }) };
}
