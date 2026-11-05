/**
 * Known cases for the bundled EITC / Child Tax Credit rules. Each case runs as
 * a full interview, so it also proves the engine asked only what was needed.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { FactGraph, runCase, runCases, validateRules, type CasesFile } from "../src/index.js";

const RULES_DIR = join(__dirname, "../rules");
const SCHEMA_DIR = join(__dirname, "../schema");
const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));

const ruleFiles = readdirSync(RULES_DIR).filter(
  (f) => f.endsWith(".json") && !f.endsWith(".cases.json"),
);
const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateRulesSchema = ajv.compile(read(join(SCHEMA_DIR, "factfinch-rules.schema.json")));
const validateCasesSchema = ajv.compile(read(join(SCHEMA_DIR, "factfinch-cases.schema.json")));

describe.each(ruleFiles)("%s", (file) => {
  const rules = read(join(RULES_DIR, file));
  const cases = read(join(RULES_DIR, file.replace(/\.json$/, ".cases.json"))) as CasesFile;
  const graph = FactGraph.load(rules);

  it("passes the engine's validator", () => {
    expect(validateRules(rules)).toEqual([]);
  });
  it("matches the JSON Schema", () => {
    expect(validateRulesSchema(rules), JSON.stringify(validateRulesSchema.errors)).toBe(true);
    expect(validateCasesSchema(cases), JSON.stringify(validateCasesSchema.errors)).toBe(true);
  });
  it("has known cases", () => {
    expect(cases.rules).toBe(graph.id);
    expect(cases.cases.length).toBeGreaterThanOrEqual(10);
    // The demo offers these as example households.
    expect(cases.cases.filter((c) => c.tags?.includes("example")).length).toBeGreaterThan(0);
  });

  it.each(cases.cases.map((c) => [c.name, c] as const))("%s", (_name, tc) => {
    const result = runCase(graph, tc);
    expect(result.failures).toEqual([]);
  });
});

describe("EITC / CTC rules behaviour", () => {
  const graph = FactGraph.load(read(join(RULES_DIR, "us-eitc-ctc-2025.json")));

  it("starts with the question that can rule everything out", () => {
    expect(graph.createSession().nextQuestion()?.path).toBe("/you/claimedAsDependent");
  });

  it("explains a result in plain words", () => {
    const s = graph.createSession();
    s.set("/you/claimedAsDependent", false);
    s.set("/you/hasSsn", true);
    s.set("/filingStatus", "single");
    s.set("/you/citizenOrResident", true);
    s.set("/you/age", 30);
    s.addItem("/children", { name: "Mia" });
    const answers: Record<string, unknown> = {
      relationship: "son_daughter",
      age: 4,
      livedWithYou: true,
      claimedByOther: false,
      supportsSelf: false,
      citizen: true,
      hasSsn: true,
    };
    let q;
    while ((q = s.nextQuestion())) {
      const field = q.path.split("/").pop()!;
      if (q.path.startsWith("/children/")) s.set(q.path, answers[field] as never);
      else if (q.type === "dollar") s.set(q.path, q.path === "/income/wages" ? 30000 : 0);
      else s.set(q.path, q.path === "/you/usHome");
    }
    const [eitc, ctc, refundable] = s.results();
    expect(eitc!.display).toBe("$3,261");
    expect(ctc!.display).toBe("$2,200");
    expect(refundable!.display).toBe("$1,700");
    const all = JSON.stringify(s.results());
    expect(all).toContain("Mia qualifies for the $2,200 Child Tax Credit.");
    expect(all).toContain("Mia is your son or daughter, which is a qualifying relationship.");
    expect(all).toContain("Your earned income (pay from work plus self-employment) is $30,000.");
  });

  it("reports wrong expectations and unanswerable questions", () => {
    const [bad] = runCases(graph, {
      cases: [
        {
          name: "wrong",
          answers: { "/you/claimedAsDependent": true },
          expect: { "/eitc/amount": 5 },
        },
      ],
    });
    expect(bad!.passed).toBe(false);
    expect(bad!.failures[0]).toMatch(/expected 5, got 0/);

    const [stuck] = runCases(graph, {
      cases: [{ name: "stuck", answers: {}, expect: { "/eitc/amount": 0 } }],
    });
    expect(stuck!.failures[0]).toMatch(/asked "\/you\/claimedAsDependent"/);
    expect(stuck!.failures[1]).toMatch(/still unknown/);
  });

  it("checks question order and unwanted questions", () => {
    const [r] = runCases(graph, {
      cases: [
        {
          name: "order",
          answers: { "/you/claimedAsDependent": true },
          expect: {},
          expectAsked: ["/filingStatus"],
          expectNotAsked: ["/you/claimedAsDependent"],
        },
      ],
    });
    expect(r!.failures).toHaveLength(2);
  });

  it("rejects cases written for other rules", () => {
    const [r] = runCases(graph, { rules: "something-else", cases: [] });
    expect(r!.failures[0]).toMatch(/not "us-eitc-ctc-2025"/);
  });

  it("reports errors for unknown facts in expectations", () => {
    const [r] = runCases(graph, {
      cases: [{ name: "x", answers: { "/you/claimedAsDependent": true }, expect: { "/nope": 1 } }],
    });
    expect(r!.failures[0]).toMatch(/No such fact/);
  });
});
