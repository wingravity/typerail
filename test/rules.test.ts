import { after, describe, it } from "node:test";
import { resolve } from "node:path";
import { RuleTester } from "@typescript-eslint/rule-tester";
import { noDefiniteAssignment } from "../src/eslint/rules/no-definite-assignment.ts";
import { noMethodBivariance } from "../src/eslint/rules/no-method-bivariance.ts";
import { noMutableArrayWidening } from "../src/eslint/rules/no-mutable-array-widening.ts";
import { noMutablePropertyWidening } from "../src/eslint/rules/no-mutable-property-widening.ts";
import { noOverloadSignature } from "../src/eslint/rules/no-overload-signature.ts";
import { noReturnTypeArgument } from "../src/eslint/rules/no-return-type-argument.ts";
import { noStructuredCloneInstance } from "../src/eslint/rules/no-structured-clone-instance.ts";
import { noTupleMutation } from "../src/eslint/rules/no-tuple-mutation.ts";
import { noTypePredicate } from "../src/eslint/rules/no-type-predicate.ts";

RuleTester.afterAll = after;
RuleTester.describe = (text, method) => {
  void describe(text, method);
};
RuleTester.it = (text, method) => {
  void it(text, method);
};
RuleTester.itOnly = (text, method) => {
  void it.only(text, method);
};

const typed = new RuleTester({
  languageOptions: {
    parserOptions: { project: "./tsconfig.json", tsconfigRootDir: resolve(import.meta.dirname, "fixtures/rules") },
  },
});

const animals = `
interface Animal { readonly name: string }
interface Dog extends Animal { bark(): void }
interface Cat extends Animal { meow(): void }
declare const rex: Dog;
declare const dogs: Dog[];
declare const readonlyDogs: readonly Dog[];
declare const pair: [Dog, Dog];
declare const holder: { dogs: Dog[] };
declare const flag: boolean;
declare function addAnimal(list: Animal[]): void;
declare function readAnimals(list: readonly Animal[]): void;
declare function first<T>(list: T[]): T | undefined;
`;

typed.run("no-mutable-array-widening", noMutableArrayWidening, {
  valid: [
    `${animals} export const a: readonly Animal[] = dogs;`,
    `${animals} export const a: Dog[] = dogs;`,
    `${animals} export const a: Animal[] = [rex];`,
    `${animals} export const a: Animal[] = [...dogs];`,
    `${animals} export const a: Animal[] = dogs.slice();`,
    `${animals} export const a = dogs;`,
    `${animals} export const a: readonly Animal[] = readonlyDogs;`,
    `${animals} readAnimals(dogs);`,
    `${animals} export const d = first(dogs);`,
    `${animals} export const names: string[] = dogs.map((d) => d.name);`,
    `${animals} export const anything: unknown[] = dogs;`,
    `type Seconds = number & { readonly __brand: "Seconds" }; declare const rows: { seconds: Seconds }[]; export const plain: { seconds: number }[] = rows;`,
  ],
  invalid: [
    { code: `${animals} export const a: Animal[] = dogs;`, errors: [{ messageId: "widened" }] },
    { code: `${animals} let a: Animal[] = []; a = dogs; export { a };`, errors: [{ messageId: "widened" }] },
    { code: `${animals} addAnimal(dogs);`, errors: [{ messageId: "widened" }] },
    { code: `${animals} export function f(): Animal[] { return dogs; }`, errors: [{ messageId: "widened" }] },
    { code: `${animals} export const f = (): Animal[] => dogs;`, errors: [{ messageId: "widened" }] },
    { code: `${animals} export const o: { list: Animal[] } = { list: dogs };`, errors: [{ messageId: "widened" }] },
    { code: `${animals} export const a: Animal[] = holder.dogs;`, errors: [{ messageId: "widened" }] },
    { code: `${animals} export const a: (Dog | Cat)[] = dogs;`, errors: [{ messageId: "widened" }] },
    { code: `${animals} export const a: Animal[] = flag ? dogs : [];`, errors: [{ messageId: "widened" }] },
    { code: `${animals} export const a: Animal[] = pair;`, errors: [{ messageId: "widened" }] },
    { code: `${animals} export const a: Animal[][] = [dogs];`, errors: [{ messageId: "widened" }] },
  ],
});

typed.run("no-mutable-property-widening", noMutablePropertyWidening, {
  valid: [
    `${animals} interface Box<T> { value: T } declare const box: Box<Dog>; export const b: Box<Dog> = box;`,
    `${animals} interface Box<T> { value: T } declare const box: Box<Dog>; export const b: { readonly value: Animal } = box;`,
    `${animals} interface Box<T> { value: T } declare const box: Box<Dog>; export const b: Box<Animal> = { ...box };`,
    `${animals} export const a: Animal = rex;`,
    `${animals} interface Named { name: string } declare const named: Named; export const n: { name: string } = named;`,
    `${animals} declare const kennel: { readonly pet: Dog }; export const h: { readonly pet: Animal } = kennel;`,
    `${animals} declare const r: Readonly<{ pet: Dog }>; export const h: Readonly<{ pet: Animal }> = r;`,
    `${animals} declare const counts: { a: number }; export const c: Readonly<Record<string, number>> = counts;`,
    `${animals} declare const holder2: { pet: Dog }; export const h: { pet: unknown } = holder2;`,
    `${animals} declare const holder2: { pet: Dog }; export const h: Record<string, unknown> = holder2;`,
    `type Seconds = number & { readonly __brand: "Seconds" }; declare const total: { seconds: Seconds }; export const plain: { seconds: number } = total;`,
    `declare const route: { handler: () => string }; export const r: { handler: (input: string) => string } = route;`,
  ],
  invalid: [
    {
      code: `${animals} interface Box<T> { value: T } declare const box: Box<Dog>; export const b: Box<Animal> = box;`,
      errors: [{ messageId: "widened" }],
    },
    {
      code: `${animals} interface Box<T> { value: T } declare const box: Box<Dog>; declare function put(b: Box<Animal>): void; put(box);`,
      errors: [{ messageId: "widened" }],
    },
    { code: `${animals} declare const kennel: { readonly pet: Dog }; export const h: { pet: Animal } = kennel;`, errors: [{ messageId: "widened" }] },
    { code: `${animals} declare const named: { a: Dog }; export const r: Record<string, Animal> = named;`, errors: [{ messageId: "widened" }] },
    {
      code: `type R = { kind: "ok"; value: string } | { kind: "error"; error: Error }; declare const r: R; export function f() { if (r.kind === "ok") { const w: { kind: "ok" | "error" } = r; return w; } return undefined; }`,
      errors: [{ messageId: "widened" }],
    },
    {
      code: `${animals} declare const outer: { readonly inner: { pet: Dog } }; export const o: { readonly inner: { pet: Animal } } = outer;`,
      errors: [{ messageId: "widened" }],
    },
  ],
});

typed.run("no-method-bivariance", noMethodBivariance, {
  valid: [
    `${animals} interface Handler<T> { handle(value: T): void } declare const h: Handler<Animal>; export const d: Handler<Dog> = h;`,
    `${animals} interface Handler<T> { handle: (value: T) => void } declare const h: Handler<Dog>; export const d: Handler<Dog> = h;`,
    `${animals} declare const s: Set<Dog>; export const r: ReadonlySet<Animal> = s;`,
    `${animals} declare const m: Map<string, Dog>; export const r: ReadonlyMap<string, Animal> = m;`,
    `${animals} declare const list: readonly Dog[]; export const r: readonly Animal[] = list;`,
    `${animals} interface Handler<T> { handle(value: T): void } export const a: Handler<Animal> = { handle(animal) { return animal; } };`,
    `${animals} interface Emitter { on<E>(event: E, listener: () => void): this } declare const a: Emitter & { id: string }; export const b: Emitter = a;`,
    `${animals} declare const dogMap: Map<string, Dog>; export const fresh: Map<string, Animal> = new Map(dogMap);`,
    `${animals} export const box: { placed: Set<Animal> } = { placed: new Set([rex]) };`,
  ],
  invalid: [
    {
      code: `${animals} interface Handler<T> { handle(value: T): void } export const a: Handler<Animal> = { handle(dog: Dog) { dog.bark(); } };`,
      errors: [{ messageId: "bivariant" }],
    },
    {
      code: `${animals} interface Handler<T> { handle(value: T): void } declare const h: Handler<Dog>; export const a: Handler<Animal> = h;`,
      errors: [{ messageId: "bivariant" }],
    },
    {
      code: `${animals} class DogHandler { handle(dog: Dog): void { dog.bark(); } } export const a: { handle(value: Animal): void } = new DogHandler();`,
      errors: [{ messageId: "bivariant" }],
    },
    {
      code: `${animals} class DogHandler { handle(dog: Dog): void { dog.bark(); } } declare const h: DogHandler; export const a: { handle(value: Animal): void } = h;`,
      errors: [{ messageId: "bivariant" }],
    },
    { code: `${animals} declare const s: Set<Dog>; export const a: Set<Animal> = s;`, errors: [{ messageId: "bivariant" }] },
    { code: `${animals} declare const m: Map<string, Dog>; declare function add(m: Map<string, Animal>): void; add(m);`, errors: [{ messageId: "bivariant" }] },
    {
      code: `${animals} interface Handler<T> { handle(value: T): void } declare const o: { readonly h: Handler<Dog> }; export const a: { readonly h: Handler<Animal> } = o;`,
      errors: [{ messageId: "bivariant" }],
    },
  ],
});

typed.run("no-tuple-mutation", noTupleMutation, {
  valid: [
    `declare const pair: readonly [number, number]; export const n = pair[0];`,
    `declare const list: number[]; list.push(1);`,
    `declare const pair: [number, number]; pair.reverse();`,
    `declare const pair: [number, number]; export const copy = [...pair, 3];`,
  ],
  invalid: [
    { code: `declare const pair: [number, number]; pair.pop();`, errors: [{ messageId: "length" }] },
    { code: `declare const pair: [number, number]; pair.push(3);`, errors: [{ messageId: "length" }] },
    { code: `declare const pair: [number, string]; pair.reverse();`, errors: [{ messageId: "order" }] },
    { code: `declare const pair: [number, number]; pair.length = 1;`, errors: [{ messageId: "length" }] },
  ],
});

typed.run("no-definite-assignment", noDefiniteAssignment, {
  valid: [`export class A { value: number | undefined; }`, `export class A { value = 1; }`],
  invalid: [
    { code: `export class A { value!: number; }`, errors: [{ messageId: "definite" }] },
    { code: `let value!: number; export { value };`, errors: [{ messageId: "definite" }] },
  ],
});

typed.run("no-type-predicate", noTypePredicate, {
  valid: [
    `export const defined = [1, undefined].filter((x) => x !== undefined);`,
    `export function isString(value: unknown): boolean { return typeof value === "string"; }`,
    `export interface Guard { check(value: unknown): value is string }`,
    `declare const values: (number | null)[]; export const numbers = values.filter((n): n is number => n !== null);`,
    `declare const values: (number | null | undefined)[]; export const numbers = values.filter((n): n is number => n != null);`,
    `type Shape = { kind: "a"; a: 1 } | { kind: "b"; b: 2 }; declare const shapes: Shape[]; export const as = shapes.filter((s): s is Extract<Shape, { kind: "a" }> => s.kind === "a");`,
    `declare const values: (string | number)[]; export const strings = values.filter((x): x is string => typeof x === "string");`,
    `interface User { id: string } declare const users: (User | undefined)[]; export const present = users.filter((u): u is User => !!u);`,
    `declare const values: (number | null)[]; export function isSet(n: number | null): n is number { return n !== null; }`,
    `declare const values: (string | null)[]; export const strings = values.filter((x): x is string => Boolean(x));`,
    `declare const values: unknown[]; export const strings = values.filter((x): x is string => typeof x === "string");`,
    `export const isNumber = (value: unknown): value is number => typeof value === "number";`,
    `type Block = { kind: "heading"; level: number } | { kind: "text" }; declare const blocks: Block[]; export const h2 = blocks.filter((b): b is Extract<Block, { kind: "heading" }> => b.kind === "heading" && b.level === 2);`,
  ],
  invalid: [
    { code: `export function isUser(value: unknown): value is { id: string } { return typeof value === "object"; }`, errors: [{ messageId: "predicate" }] },
    { code: `export function assertUser(value: unknown): asserts value is { id: string } {}`, errors: [{ messageId: "assertion" }] },
    { code: `export class Node { isLeaf(): this is { leaf: true } { return true; } }`, errors: [{ messageId: "predicate" }] },
    { code: `declare const values: (string | number)[]; export const wrong = values.filter((x): x is number => typeof x === "string");`, errors: [{ messageId: "predicate" }] },
    { code: `export function isText(x: string | null): x is string { return !!x; }`, errors: [{ messageId: "predicate" }] },
    { code: `declare const values: unknown[]; export const strings = values.filter((x): x is string => !!x);`, errors: [{ messageId: "predicate" }] },
    {
      code: `type Shape = { kind: "a"; a: 1 } | { kind: "b"; b: 2 }; declare const shapes: Shape[]; export const all = shapes.filter((s): s is Shape => s.kind === "a");`,
      errors: [{ messageId: "predicate" }],
    },
    { code: `declare const values: (number | null)[]; export const numbers = values.filter((n): n is number => n !== null || n === 0);`, errors: [{ messageId: "predicate" }] },
  ],
});

typed.run("no-overload-signature", noOverloadSignature, {
  valid: [
    `export function parse(text: string): number | string { return text; }`,
    `declare function external(a: string): string; declare function external(a: number): number; export const e = external;`,
    `declare module "x" { function f(a: string): string; function f(a: number): number; }`,
    `export interface Parse { (text: string): number; (text: number): string }`,
    `declare class Base { connect(): Promise<void>; connect(cb: () => void): void; } export class Child extends Base { override connect(): Promise<void>; override connect(cb: () => void): void; override connect(cb?: () => void): Promise<void> | void { return cb === undefined ? Promise.resolve() : cb(); } }`,
  ],
  invalid: [
    {
      code: `export function parse(text: string): number; export function parse(text: string): number | string { return text; }`,
      errors: [{ messageId: "overload" }],
    },
    {
      code: `export class P { parse(text: string): number; parse(text: string): number | string { return text; } }`,
      errors: [{ messageId: "overload" }],
    },
  ],
});

typed.run("no-return-type-argument", noReturnTypeArgument, {
  valid: [
    `declare function identity<T>(value: T): T; export const n = identity<number>(1);`,
    `declare function empty<T>(): T[]; export const list = empty<string>();`,
    `export const set = new Set<string>();`,
    `declare function make<T>(): Map<string, T>; export const m = make<number>();`,
    `declare function parseAs<T>(text: string): T; export const u: unknown = parseAs("1");`,
    `type StaffId = number & { readonly __brand: "StaffId" }; declare function column(): { $type<T>(): T }; export const id = column().$type<StaffId>();`,
    `declare function createSignal<T>(): [() => T | undefined, (value: T | undefined) => void]; export const signal = createSignal<{ id: string }>();`,
  ],
  invalid: [
    { code: `declare function parseAs<T>(text: string): T; export const n = parseAs<number>("1");`, errors: [{ messageId: "returnOnly" }] },
    { code: `declare function get<T>(url: string): Promise<T>; export const p = get<{ id: string }>("/u");`, errors: [{ messageId: "returnOnly" }] },
    { code: `declare function find<E extends object>(selector: string): E | null; export const e = find<{ id: string }>("#x");`, errors: [{ messageId: "returnOnly" }] },
    { code: `declare function useParams<T>(): T; export const p = useParams<{ slug: string }>();`, errors: [{ messageId: "returnOnly" }] },
    { code: `declare function column(): { $type<T>(): T }; export const c = column().$type<"a" | "b">();`, errors: [{ messageId: "returnOnly" }] },
    {
      code: `interface Column<C, T> { c: C; t: T } declare function jsonb(): { $type<T>(): Column<string, T> }; export const c = jsonb().$type<string[]>();`,
      errors: [{ messageId: "returnOnly" }],
    },
  ],
});

typed.run("no-structured-clone-instance", noStructuredCloneInstance, {
  valid: [
    `export const copy = structuredClone({ a: 1 });`,
    `export const date = structuredClone(new Date());`,
    `class Data { constructor(readonly a: number) {} } export const copy = structuredClone(new Data(1));`,
    `export const map = structuredClone(new Map<string, number>());`,
  ],
  invalid: [
    { code: `class Session { greet(): string { return "hi"; } } export const copy = structuredClone(new Session());`, errors: [{ messageId: "instance" }] },
    { code: `class Session { get id(): number { return 1; } } declare const s: Session; export const copy = globalThis.structuredClone(s);`, errors: [{ messageId: "instance" }] },
  ],
});
