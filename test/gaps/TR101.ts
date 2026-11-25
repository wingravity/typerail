interface Animal {
  name: string;
}

interface Dog extends Animal {
  bark(): string;
}

const rex: Dog = { name: "Rex", bark: () => "woof" };

export function proof(): string {
  const dogs: Dog[] = [rex];
  const animals: Animal[] = dogs;
  animals.push({ name: "Tom" });
  const dog = dogs[1];
  return dog === undefined ? "" : dog.bark();
}
