import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { attempt, attemptAsync, err, ok } from "../src/internal/result.ts";
import { ensureDir, readTextFile, writeTextFile } from "../src/internal/fs.ts";
import { jsonNestingDepth, safeJsonParse, safeJsonStringify } from "../src/internal/json.ts";

let dir = "";

before(async () => {
  dir = await mkdtemp(join(tmpdir(), "typerail-"));
  await writeFile(join(dir, "hello.txt"), "hello");
});

after(async () => {
  await rm(dir, { recursive: true, force: true });
});

function kindOf(r: { ok: true } | { ok: false; error: { kind: string } }): string {
  return r.ok ? "ok" : r.error.kind;
}

describe("attempt", () => {
  it("captures a return value", () => {
    assert.deepEqual(attempt(() => 42, String), ok(42));
  });

  it("captures a throw", () => {
    const r = attempt(
      () => {
        throw new Error("boom");
      },
      (cause) => (cause instanceof Error ? cause.message : "?"),
    );
    assert.deepEqual(r, err("boom"));
  });
});

describe("attemptAsync", () => {
  it("captures a resolved value", async () => {
    assert.deepEqual(await attemptAsync(() => Promise.resolve(1), String), ok(1));
  });

  it("captures a rejection", async () => {
    assert.deepEqual(await attemptAsync(() => Promise.reject(new Error("no")), () => "rejected"), err("rejected"));
  });

  it("captures a synchronous throw before any promise exists", async () => {
    const r = await attemptAsync(
      () => {
        throw new Error("sync");
      },
      () => "caught",
    );
    assert.deepEqual(r, err("caught"));
  });

  it("accepts plain values", async () => {
    assert.deepEqual(await attemptAsync(() => "plain", String), ok("plain"));
  });
});

describe("fs wrappers", () => {
  it("reads and writes text files", async () => {
    const path = join(dir, "out.txt");
    assert.deepEqual(await writeTextFile(path, "written"), { ok: true, value: undefined });
    assert.deepEqual(await readTextFile(path), { ok: true, value: "written" });
  });

  it("returns FsError with the code and path for a missing file", async () => {
    const path = join(dir, "missing.txt");
    const r = await readTextFile(path);
    assert.ok(!r.ok && r.error.kind === "FsError");
    assert.equal(r.error.code, "ENOENT");
    assert.equal(r.error.path, path);
  });

  it("refuses files over maxBytes without reading them", async () => {
    const r = await readTextFile(join(dir, "hello.txt"), { maxBytes: 3 });
    assert.ok(!r.ok && r.error.kind === "FileTooLarge");
    assert.equal(r.error.size, 5);
  });


  it("reports writes into missing directories", async () => {
    const r = await writeTextFile(join(dir, "nope", "x.txt"), "x");
    assert.ok(!r.ok && r.error.code === "ENOENT");
  });

  it("creates directories", async () => {
    const path = join(dir, "a", "b");
    assert.deepEqual(await ensureDir(path), { ok: true, value: undefined });
    assert.deepEqual(await writeTextFile(join(path, "x.txt"), "x"), { ok: true, value: undefined });
  });
});

describe("safeJsonParse", () => {
  it("parses valid JSON to unknown", () => {
    assert.deepEqual(safeJsonParse('{"a":[1,2]}'), { ok: true, value: { a: [1, 2] } });
  });

  it("returns JsonSyntaxError instead of throwing", () => {
    const r = safeJsonParse("{bad");
    assert.equal(kindOf(r), "JsonSyntaxError");
    assert.ok(!r.ok && r.error.cause instanceof SyntaxError);
  });

  it("rejects input over maxLength before parsing", () => {
    assert.equal(kindOf(safeJsonParse('"abcdef"', { maxLength: 5 })), "JsonTooLarge");
  });

  it("rejects nesting over maxDepth before parsing", () => {
    const deep = "[".repeat(10) + "]".repeat(10);
    assert.equal(kindOf(safeJsonParse(deep, { maxDepth: 9 })), "JsonTooDeep");
    assert.equal(kindOf(safeJsonParse(deep, { maxDepth: 10 })), "ok");
  });

  it("enforces the default depth limit", () => {
    const deep = "[".repeat(100_000) + "]".repeat(100_000);
    assert.equal(kindOf(safeJsonParse(deep)), "JsonTooDeep");
  });
});

describe("jsonNestingDepth", () => {
  it("ignores brackets inside strings, including escaped quotes", () => {
    assert.equal(jsonNestingDepth('{"a":"[[[{{{","b":"\\"[[["}'), 1);
    assert.equal(jsonNestingDepth('[{"a":[1]}]'), 3);
    assert.equal(jsonNestingDepth("42"), 0);
  });
});

describe("safeJsonStringify", () => {
  it("stringifies plain values", () => {
    assert.deepEqual(safeJsonStringify({ a: 1 }), { ok: true, value: '{"a":1}' });
    assert.deepEqual(safeJsonStringify([1], 2), { ok: true, value: "[\n  1\n]" });
  });

  it("returns an error for BigInt and cycles", () => {
    assert.equal(kindOf(safeJsonStringify({ n: 1n })), "JsonStringifyError");
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    assert.equal(kindOf(safeJsonStringify(cyclic)), "JsonStringifyError");
  });

  it("reports values with no JSON representation", () => {
    assert.equal(kindOf(safeJsonStringify(undefined)), "JsonNotSerializable");
    assert.equal(kindOf(safeJsonStringify(() => 1)), "JsonNotSerializable");
  });
});
