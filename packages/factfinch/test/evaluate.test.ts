import { describe, expect, it } from "vitest";
import { FactfinchError, FactGraph, type Expr, type RulesFile, type Value } from "../src/index.js";

/** Build a graph with inputs a, b (booleans), x, y (numbers), s (string) and one derived fact. */
function evalExpr(
  derive: Expr,
  answers: Record<string, Value> = {},
  extra: Partial<RulesFile> = {},
) {
  const rules: RulesFile = {
    factfinch: 1,
    id: "t",
    title: "t",
    version: "1",
    constants: { ten: 10 },
    tables: { t: { a: 1, b: 2 } },
    facts: {
      "/a": { type: "boolean", question: { prompt: "a?" } },
      "/b": { type: "boolean", question: { prompt: "b?" } },
      "/x": { type: "number", question: { prompt: "x?" } },
      "/y": { type: "number", question: { prompt: "y?" } },
      "/s": { type: "string", question: { prompt: "s?" } },
      "/out": { type: "number", derive },
    },
    results: [{ fact: "/out", label: "out" }],
    ...extra,
  };
  const session = FactGraph.load(rules).createSession();
  for (const [k, v] of Object.entries(answers)) session.set(k, v);
  return session.get("/out");
}

const a = { fact: "/a" };
const b = { fact: "/b" };
const x = { fact: "/x" };
const y = { fact: "/y" };

describe("literals and references", () => {
  it("evaluates literals", () => {
    expect(evalExpr(5)).toMatchObject({ known: true, value: 5 });
    expect(evalExpr("hi")).toMatchObject({ known: true, value: "hi" });
    expect(evalExpr(true)).toMatchObject({ known: true, value: true });
  });
  it("reports a missing input", () => {
    expect(evalExpr(x)).toEqual({ known: false, missing: ["/x"], deps: ["/x"] });
  });
  it("reads constants", () => {
    expect(evalExpr({ const: "ten" })).toMatchObject({ known: true, value: 10 });
  });
});

describe("three-valued logic", () => {
  it("and is false as soon as one part is false, even with unknowns", () => {
    expect(evalExpr({ and: [a, b] }, { "/b": false })).toMatchObject({
      known: true,
      value: false,
      deps: ["/b"],
    });
  });
  it("and asks about parts left to right", () => {
    expect(evalExpr({ and: [a, b] })).toMatchObject({ known: false, missing: ["/a"] });
    expect(evalExpr({ and: [a, b] }, { "/a": true })).toMatchObject({
      known: false,
      missing: ["/b"],
    });
    expect(evalExpr({ and: [a, b] }, { "/a": true, "/b": true })).toMatchObject({
      known: true,
      value: true,
    });
  });
  it("a true or cites only its first true part", () => {
    expect(evalExpr({ or: [a, b] }, { "/a": true, "/b": true })).toMatchObject({
      value: true,
      deps: ["/a"],
    });
  });
  it("a false and cites every false part", () => {
    expect(evalExpr({ and: [a, b] }, { "/a": false, "/b": false })).toMatchObject({
      deps: ["/a", "/b"],
    });
  });
  it("or is true as soon as one part is true", () => {
    expect(evalExpr({ or: [a, b] }, { "/b": true })).toMatchObject({
      known: true,
      value: true,
      deps: ["/b"],
    });
    expect(evalExpr({ or: [a, b] }, { "/a": false })).toMatchObject({
      known: false,
      missing: ["/b"],
    });
    expect(evalExpr({ or: [a, b] }, { "/a": false, "/b": false })).toMatchObject({ value: false });
  });
  it("not", () => {
    expect(evalExpr({ not: a }, { "/a": true })).toMatchObject({ value: false });
    expect(evalExpr({ not: a })).toMatchObject({ known: false, missing: ["/a"] });
  });
  it("ignores errors in parts after the deciding one", () => {
    // The second part would divide by zero, but the first already decides.
    const guarded = { and: [{ gt: [x, 0] }, { gt: [{ div: [10, x] }, 1] }] } as Expr;
    expect(evalExpr(guarded, { "/x": 0 })).toMatchObject({ known: true, value: false });
  });
  it("rejects non-boolean parts", () => {
    expect(() => evalExpr({ and: [x] }, { "/x": 1 })).toThrow(FactfinchError);
  });
});

describe("if", () => {
  it("takes the branch the condition picks", () => {
    expect(evalExpr({ if: [a, x, 0] }, { "/a": true, "/x": 7 })).toMatchObject({ value: 7 });
    expect(evalExpr({ if: [a, x, 0] }, { "/a": false })).toMatchObject({ value: 0 });
  });
  it("only asks for the condition while it is unknown", () => {
    expect(evalExpr({ if: [a, x, y] })).toMatchObject({ known: false, missing: ["/a"] });
  });
  it("is settled when both branches agree", () => {
    expect(evalExpr({ if: [a, 3, 3] })).toMatchObject({ known: true, value: 3 });
  });
  it("propagates unknown branches", () => {
    expect(evalExpr({ if: [a, x, 0] }, { "/a": true })).toMatchObject({
      known: false,
      missing: ["/x"],
    });
  });
});

describe("comparisons", () => {
  it.each([
    ["eq", 2, 2, true],
    ["neq", 2, 3, true],
    ["gt", 3, 2, true],
    ["gte", 2, 2, true],
    ["lt", 1, 2, true],
    ["lte", 3, 2, false],
  ])("%s(%d, %d) = %s", (op, l, r, out) => {
    expect(evalExpr({ [op]: [x, y] } as Expr, { "/x": l, "/y": r })).toMatchObject({ value: out });
  });
  it("eq works on strings", () => {
    expect(evalExpr({ eq: [{ fact: "/s" }, "hi"] }, { "/s": "hi" })).toMatchObject({ value: true });
  });
  it("ordering needs numbers", () => {
    expect(() => evalExpr({ gt: [{ fact: "/s" }, 1] }, { "/s": "hi" })).toThrow(/needs numbers/);
  });
  it("unknown when a side is missing", () => {
    expect(evalExpr({ gt: [x, y] }, { "/x": 1 })).toMatchObject({ known: false, missing: ["/y"] });
  });
  it("in checks list membership", () => {
    expect(evalExpr({ in: [{ fact: "/s" }, ["a", "b"]] }, { "/s": "b" })).toMatchObject({
      value: true,
    });
    expect(evalExpr({ in: [{ fact: "/s" }, ["a", "b"]] })).toMatchObject({ known: false });
  });
});

describe("arithmetic", () => {
  it("add, sub, mul, div, min, max", () => {
    const ans = { "/x": 6, "/y": 3 };
    expect(evalExpr({ add: [x, y, 1] }, ans)).toMatchObject({ value: 10 });
    expect(evalExpr({ sub: [x, y] }, ans)).toMatchObject({ value: 3 });
    expect(evalExpr({ mul: [x, y] }, ans)).toMatchObject({ value: 18 });
    expect(evalExpr({ div: [x, y] }, ans)).toMatchObject({ value: 2 });
    expect(evalExpr({ min: [x, y] }, ans)).toMatchObject({ value: 3 });
    expect(evalExpr({ max: [x, y] }, ans)).toMatchObject({ value: 6 });
  });
  it("multiplying by a known zero is zero even with unknowns", () => {
    expect(evalExpr({ mul: [x, 0] })).toMatchObject({ known: true, value: 0 });
    expect(evalExpr({ div: [0, x] })).toMatchObject({ known: true, value: 0 });
  });
  it("division by zero is an error", () => {
    expect(() => evalExpr({ div: [x, y] }, { "/x": 1, "/y": 0 })).toThrow(/Division by zero/);
  });
  it("rounding avoids floating point noise", () => {
    expect(evalExpr({ round: 2.5 })).toMatchObject({ value: 3 });
    expect(evalExpr({ round: -2.5 })).toMatchObject({ value: -3 });
    expect(evalExpr({ floor: { mul: [0.1, 30] } })).toMatchObject({ value: 3 });
    expect(evalExpr({ ceil: { mul: [0.1, 30] } })).toMatchObject({ value: 3 });
    expect(evalExpr({ ceil: 2.1 })).toMatchObject({ value: 3 });
    expect(evalExpr({ round: x })).toMatchObject({ known: false });
  });
  it("needs numbers", () => {
    expect(() => evalExpr({ add: [{ fact: "/s" }, 1] }, { "/s": "x" })).toThrow(/needs numbers/);
  });
});

describe("lookup", () => {
  it("reads table rows", () => {
    expect(evalExpr({ lookup: { table: "t", key: { fact: "/s" } } }, { "/s": "b" })).toMatchObject({
      value: 2,
    });
  });
  it("uses the default for missing rows", () => {
    expect(
      evalExpr({ lookup: { table: "t", key: { fact: "/s" }, default: 0 } }, { "/s": "z" }),
    ).toMatchObject({ value: 0 });
  });
  it("errors without a default", () => {
    expect(() => evalExpr({ lookup: { table: "t", key: { fact: "/s" } } }, { "/s": "z" })).toThrow(
      /no row/,
    );
  });
  it("is unknown while the key is", () => {
    expect(evalExpr({ lookup: { table: "t", key: { fact: "/s" } } })).toMatchObject({
      known: false,
    });
  });
});
