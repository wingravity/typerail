function price(tier: "free" | "pro"): number {
  let total = 0;
  switch (tier) {
    case "free":
      total += 0;
    case "pro":
      total += 20;
      break;
  }
  return total;
}

export function proof(): { expected: number; actual: number } {
  return { expected: 0, actual: price("free") };
}
