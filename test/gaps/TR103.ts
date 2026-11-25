interface Animal {
  name: string;
}

interface Dog extends Animal {
  bark(): string;
}

const rex: Dog = { name: "Rex", bark: () => "woof" };

interface Handler<T> {
  handle(value: T): string;
}

export function proof(): string {
  const dogHandler: Handler<Dog> = { handle: (dog) => dog.bark() };
  const animalHandler: Handler<Animal> = dogHandler;
  return animalHandler.handle({ name: "Tom" });
}
