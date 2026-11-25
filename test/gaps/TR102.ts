interface Animal {
  name: string;
}

interface Dog extends Animal {
  bark(): string;
}

const rex: Dog = { name: "Rex", bark: () => "woof" };

interface Box<T> {
  value: T;
}

export function proof(): string {
  const dogBox: Box<Dog> = { value: rex };
  const animalBox: Box<Animal> = dogBox;
  animalBox.value = { name: "Tom" };
  return dogBox.value.bark();
}
