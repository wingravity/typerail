export function proof(): string {
  const point: [number, number] = [1, 2];
  point.pop();
  return point[1].toFixed();
}
