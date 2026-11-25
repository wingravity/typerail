interface Animal { readonly name: string }
interface Dog extends Animal { bark(): void }

interface Box<T> { value: T }
interface Handler<T> { handle(value: T): void }

export function boxes(box: Box<Dog>): Box<Animal> {
  return box; // @expect typerail/no-mutable-property-widening
}

export function readOnlyBox(box: Box<Dog>): Readonly<Box<Animal>> {
  return box;
}

export function handlers(handler: Handler<Dog>): Handler<Animal> {
  return handler; // @expect typerail/no-method-bivariance
}

export function sets(dogs: Set<Dog>): Set<Animal> {
  return dogs; // @expect typerail/no-method-bivariance
}

export function readOnlySets(dogs: Set<Dog>): ReadonlySet<Animal> {
  return dogs;
}

export function tuples(point: [number, number]): number {
  point.pop(); // @expect typerail/no-tuple-mutation
  return point.length;
}
