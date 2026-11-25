class Base {
  constructor() {
    this.init();
  }

  init(): void {}
}

class Counter extends Base {
  step = 1;

  override init(): void {
    this.step.toFixed();
  }
}

export function proof(): Counter {
  return new Counter();
}
