import { describe, expect, it } from "vitest";
import { FactGraph, RulesError, validateRules } from "../src/index.js";
import { clone, tinyRules } from "./fixtures.js";

function issuesFor(mutate: (r: Record<string, any>) => void): string[] {
  const rules = clone(tinyRules) as Record<string, any>;
  mutate(rules);
  return validateRules(rules).map((i) => `${i.where}: ${i.message}`);
}

describe("validateRules", () => {
  it("accepts a good rules file", () => {
    expect(validateRules(tinyRules)).toEqual([]);
  });

  it("rejects non-objects and missing top-level fields", () => {
    expect(validateRules(null)[0]!.message).toMatch(/JSON object/);
    expect(validateRules({ factfinch: 1 }).map((i) => i.where)).toEqual([
      "id",
      "title",
      "version",
      "facts",
    ]);
    expect(issuesFor((r) => (r.factfinch = 2))).toEqual([
      "factfinch: expected format version 1, got 2",
    ]);
    expect(issuesFor((r) => (r.results = []))).toEqual(["results: must be a non-empty array"]);
  });

  it("checks fact shapes", () => {
    expect(
      issuesFor((r) => (r.facts["bad path"] = { type: "boolean", question: { prompt: "?" } }))[0],
    ).toMatch(/fact paths look like/);
    expect(issuesFor((r) => (r.facts["/x"] = { type: "date", question: { prompt: "?" } }))).toEqual(
      ['facts./x.type: unknown type "date"'],
    );
    expect(issuesFor((r) => (r.facts["/x"] = { type: "boolean" }))[0]).toMatch(/exactly one of/);
    expect(
      issuesFor((r) => (r.facts["/x"] = { type: "boolean", question: { prompt: "" } }))[0],
    ).toMatch(/non-empty string/);
    expect(issuesFor((r) => (r.facts["/x"] = { type: "collection", derive: 1 }))).toContain(
      "facts./x: collections are asked, not derived",
    );
    expect(issuesFor((r) => (r.facts["/x"] = 5))).toEqual(["facts./x: must be an object"]);
  });

  it("checks enums, bounds and explain text", () => {
    expect(issuesFor((r) => (r.facts["/color"].options = []))[0]).toMatch(/at least one option/);
    expect(
      issuesFor((r) => r.facts["/color"].options.push({ value: "red", label: "Again" })),
    ).toEqual(['facts./color.options: duplicate option "red"']);
    expect(issuesFor((r) => r.facts["/color"].options.push({ value: 1 }))[0]).toMatch(
      /string `value`/,
    );
    expect(issuesFor((r) => Object.assign(r.facts["/income"], { min: 10, max: 1 }))).toEqual([
      "facts./income: min is greater than max",
    ]);
    expect(issuesFor((r) => (r.facts["/income"].min = "0"))).toEqual([
      "facts./income.min: must be a number",
    ]);
    expect(issuesFor((r) => (r.facts["/eligible"].explain = { maybe: "x" }))[0]).toMatch(
      /true, false, zero or known/,
    );
    expect(issuesFor((r) => (r.facts["/eligible"].explain = { true: 1 }))[0]).toMatch(
      /must be a string/,
    );
    expect(issuesFor((r) => (r.facts["/eligible"].explain = "x"))[0]).toMatch(/must be an object/);
  });

  it("checks collection paths", () => {
    expect(
      issuesFor((r) => (r.facts["/nope/*/x"] = { type: "boolean", question: { prompt: "?" } }))[0],
    ).toMatch(/must be a collection/);
    expect(issuesFor((r) => (r.facts["/pets"].itemName = "nick"))).toEqual([
      "facts./pets.itemName: no fact named /pets/*/nick",
    ]);
  });

  it("checks references in expressions and templates", () => {
    expect(issuesFor((r) => (r.facts["/eligible"].derive = { fact: "/missing" }))).toEqual([
      "facts./eligible.derive.fact: no fact named /missing",
    ]);
    expect(issuesFor((r) => (r.facts["/eligible"].derive = { fact: "./age" }))[0]).toMatch(
      /must start with \//,
    );
    expect(issuesFor((r) => (r.facts["/eligible"].derive = { fact: "/pets/*/age" }))[0]).toMatch(
      /use count\/sum/,
    );
    expect(issuesFor((r) => (r.facts["/eligible"].derive = { const: "nope" }))[0]).toMatch(
      /no constant/,
    );
    expect(
      issuesFor((r) => (r.facts["/income"].question.help = "{{/nope}} {{const:x}} {{item}}")),
    ).toEqual([
      "facts./income.question.help: no fact named /nope",
      "facts./income.question.help: no constant named x",
      "facts./income.question.help: {{item}} only works inside a collection item",
    ]);
  });

  it("checks operators and arity", () => {
    const bad = (derive: unknown) => issuesFor((r) => (r.facts["/eligible"].derive = derive))[0];
    expect(bad({ xor: [] })).toMatch(/exactly one operator/);
    expect(bad({ and: [], or: [] })).toMatch(/exactly one operator/);
    expect(bad(null)).toMatch(/must be a number/);
    expect(bad({ and: [] })).toMatch(/at least one/);
    expect(bad({ and: true })).toMatch(/takes an array/);
    expect(bad({ if: [true, 1] })).toMatch(/exactly 3/);
    expect(bad({ gt: [1] })).toMatch(/exactly 2/);
    expect(bad({ in: [1, 2] })).toMatch(/"in" takes/);
    expect(bad({ count: "/pets" })).toMatch(/takes \{in/);
    expect(bad({ count: { in: "/income" } })).toMatch(/not a collection/);
    expect(bad({ sum: { in: "/pets" } })).toMatch(/needs "of"/);
    expect(bad({ sum: { in: "/pets", of: { fact: "./nope" } } })).toMatch(
      /no fact named \/pets\/\*\/nope/,
    );
    expect(bad({ lookup: { key: 1 } })).toMatch(/takes \{table/);
    expect(bad({ lookup: { table: "nope", key: 1 } })).toMatch(/no table/);
    expect(bad({ fact: 5 })).toMatch(/must be a string/);
  });

  it("checks results", () => {
    expect(issuesFor((r) => (r.results = [{ fact: "/missing", label: "x" }]))).toEqual([
      "results[0].fact: no fact named /missing",
    ]);
    expect(issuesFor((r) => (r.results = [{ fact: "/pets/*/age", label: "x" }]))[0]).toMatch(
      /top-level/,
    );
    expect(issuesFor((r) => (r.results = [{ label: "x" }]))[0]).toMatch(/needs a string/);
  });

  it("finds cycles", () => {
    const issues = issuesFor((r) => {
      r.facts["/p"] = { type: "boolean", derive: { fact: "/q" } };
      r.facts["/q"] = { type: "boolean", derive: { not: { fact: "/p" } } };
    });
    expect(issues.some((i) => /circular definition: \/p -> \/q -> \/p/.test(i))).toBe(true);
  });

  it("FactGraph.load throws a RulesError listing the problems", () => {
    const rules = clone(tinyRules) as Record<string, any>;
    for (let i = 0; i < 7; i++) rules.facts[`/bad${i}`] = { type: "nope" };
    try {
      FactGraph.load(rules);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(RulesError);
      expect((err as RulesError).issues).toHaveLength(7);
      expect((err as RulesError).message).toMatch(/and 2 more/);
      expect((err as RulesError).code).toBe("INVALID_RULES");
    }
  });
});
