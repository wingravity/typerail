class Counter {
  private count = 0;

  increment(): number {
    this.count += 1;
    return this.count;
  }
}

export function proof(): number {
  const counter = new Counter();
  const increment = counter.increment;
  return increment();
}
