type Shape = { kind: "circle"; radius: number } | { kind: "square"; side: number };

export function area(shape: Shape): number {
  switch (shape.kind) { // @expect @typescript-eslint/switch-exhaustiveness-check
    case "circle":
      return shape.radius;
  }
  return 0;
}

const save = (): Promise<void> => Promise.resolve();

export function floating(): void {
  save(); // @expect @typescript-eslint/no-floating-promises
}

export function misused(ids: readonly string[]): void {
  ids.forEach(async () => { // @expect @typescript-eslint/no-misused-promises
    await save();
  });
}

interface Animal { readonly name: string }
interface Dog extends Animal { bark(): void }

export function widened(dogs: Dog[]): Animal[] {
  const animals: Animal[] = dogs; // @expect typerail/no-mutable-array-widening
  return animals;
}

export function copied(dogs: Dog[]): readonly Animal[] {
  return dogs;
}

class Counter {
  private count = 0;
  increment(): number {
    this.count += 1;
    return this.count;
  }
}

const counter = new Counter();
export const detached = counter.increment; // @expect @typescript-eslint/unbound-method
export const bound = (): number => counter.increment();

export const copiedCounter = { ...counter }; // @expect @typescript-eslint/no-misused-spread

export function removeFirst(items: string[]): void {
  delete items[0]; // @expect @typescript-eslint/no-array-delete
}

export interface Merged { label: string } // @expect @typescript-eslint/no-unsafe-declaration-merging
export class Merged {} // @expect @typescript-eslint/no-unsafe-declaration-merging
