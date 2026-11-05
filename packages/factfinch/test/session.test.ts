import { describe, expect, it, vi } from "vitest";
import { FactfinchError, FactGraph, parseAnswer, VERSION, BUILD_INFO } from "../src/index.js";
import { tinyRules } from "./fixtures.js";

const graph = FactGraph.load(tinyRules);

function eligibleWithPets() {
  const s = graph.createSession();
  s.set("/isMember", true);
  s.set("/income", 50);
  s.addItem("/pets", { id: "p1", name: "Rex" });
  s.addItem("/pets", { id: "p2", name: "Tom" });
  s.set("/pets/#p1/age", 1);
  s.set("/pets/#p2/age", 9);
  return s;
}

describe("FactGraph", () => {
  it("exposes metadata and definitions", () => {
    expect(graph.id).toBe("tiny");
    expect(graph.version).toBe("1.0.0");
    expect(graph.definition("/pets/#x/age")?.type).toBe("integer");
    expect(graph.isInput("/income")).toBe(true);
    expect(graph.isInput("/benefit")).toBe(false);
    expect(graph.paths()).toContain("/pets/*/isYoung");
  });
  it("exports a version", () => {
    expect(VERSION).toBe(BUILD_INFO.version);
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe("the interview", () => {
  it("asks only what is still needed, in order", () => {
    const s = graph.createSession();
    expect(s.nextQuestion()?.path).toBe("/isMember");
    s.set("/isMember", false);
    // Not a member: nothing else can change the result.
    expect(s.nextQuestion()).toBeUndefined();
    expect(s.isComplete()).toBe(true);
    expect(s.value("/benefit")).toBe(0);
  });

  it("walks through collection items", () => {
    const s = graph.createSession();
    s.set("/isMember", true);
    expect(s.nextQuestion()?.path).toBe("/income");
    s.set("/income", 50);
    const q = s.nextQuestion()!;
    expect(q).toMatchObject({
      path: "/pets",
      type: "collection",
      itemNoun: "pet",
      addLabel: "Add a pet",
      itemName: "name",
    });
    s.addItem("/pets", { name: "Rex" });
    s.addItem("/pets", { name: "Tom" });
    const pending = s.pendingQuestions().map((p) => p.path);
    expect(pending).toEqual(["/pets/#item1/age", "/pets/#item2/age"]);
    const age = s.nextQuestion()!;
    expect(age.prompt).toBe("How old is Rex?");
    expect(age.item).toEqual({ collection: "/pets", id: "item1", label: "Rex", index: 0 });
    s.set("/pets/#item1/age", 1);
    s.set("/pets/#item2/age", 2);
    expect(s.isComplete()).toBe(true);
    expect(s.value("/benefit")).toBe(28); // 2 young pets * 10 + bonus 8
    expect(s.value("/totalPetAge")).toBe(3);
  });

  it("renders help templates with constants", () => {
    const s = graph.createSession();
    s.set("/isMember", true);
    expect(s.question("/income").help).toBe("Limit is $100.");
  });

  it("returns the current answer when going back", () => {
    const s = eligibleWithPets();
    expect(s.question("/income").answer).toBe(50);
    expect(s.answeredQuestions().map((q) => q.path)).toEqual([
      "/isMember",
      "/income",
      "/pets",
      "/pets/#p1/name",
      "/pets/#p1/age",
      "/pets/#p2/name",
      "/pets/#p2/age",
    ]);
  });

  it("lists only answers that still matter", () => {
    const s = eligibleWithPets();
    s.set("/color", "red");
    expect(s.relevantAnswers().map((q) => q.path)).toEqual([
      "/isMember",
      "/income",
      "/pets",
      "/pets/#p1/age",
      "/pets/#p2/age",
    ]);
    s.set("/isMember", false);
    expect(s.relevantAnswers().map((q) => q.path)).toEqual(["/isMember"]);
  });

  it("uses default item labels before names are known", () => {
    const s = graph.createSession();
    s.set("/pets", ["a"]);
    expect(s.itemLabel("/pets", "a")).toBe("Pet 1");
    expect(s.question("/pets/#a/age").prompt).toBe("How old is Pet 1?");
  });
});

describe("answers", () => {
  it("validates by type", () => {
    const s = graph.createSession();
    expect(() => s.set("/isMember", "yes" as never)).toThrow(FactfinchError);
    expect(() => s.set("/income", -1)).toThrow(/at least 0/);
    expect(() => s.set("/income", Number.NaN)).toThrow(/number/);
    expect(() => s.set("/color", "green")).toThrow(/one of: red, blue/);
    expect(() => s.set("/benefit", 1)).toThrow(/worked out/);
    expect(() => s.set("/nope", 1)).toThrow(/No such fact/);
    s.set("/pets", ["a"]);
    expect(() => s.set("/pets/#a/age", 1.5)).toThrow(/whole number/);
    expect(() => s.set("/pets/#a/age", 41)).toThrow(/at most 40/);
    expect(() => s.set("/pets/#a/name", "x".repeat(21))).toThrow(/20 characters/);
    expect(() => s.set("/pets/#zz/age", 1)).toThrow(/No item "zz"/);
    expect(() => s.set("/pets", ["a", "a"])).toThrow(/unique/);
    expect(() => s.set("/pets", ["bad id"])).toThrow(/Invalid item id/);
    expect(() => s.set("/pets", "a" as never)).toThrow(/list/);
  });

  it("removing an item removes its answers", () => {
    const s = eligibleWithPets();
    s.removeItem("/pets", "p1");
    expect(s.items("/pets")).toEqual(["p2"]);
    expect(s.answer("/pets/#p1/age")).toBeUndefined();
    expect(s.value("/youngPets")).toBe(0);
  });

  it("unset clears answers, including collection items", () => {
    const s = eligibleWithPets();
    s.unset("/income");
    expect(s.value("/benefit")).toBeUndefined();
    s.unset("/pets");
    expect(s.allAnswers()).toEqual({ "/isMember": true });
  });

  it("addItem picks unused ids", () => {
    const s = graph.createSession();
    s.set("/pets", ["item2"]);
    expect(s.addItem("/pets")).toBe("item3");
    expect(() => s.addItem("/income")).toThrow(/Not a collection/);
  });

  it("notifies subscribers", () => {
    const s = graph.createSession();
    const fn = vi.fn();
    const off = s.subscribe(fn);
    s.set("/isMember", true);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(s.revision).toBe(1);
    off();
    s.set("/isMember", false);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("throws for unknown items when reading", () => {
    const s = graph.createSession();
    s.set("/pets", []);
    expect(() => s.get("/pets/#ghost/age")).toThrow(/No item/);
    expect(graph.createSession().get("/pets/#ghost/age")).toMatchObject({
      known: false,
      missing: ["/pets"],
    });
  });
});

describe("batch, clear and sections", () => {
  it("notifies once for a batch of changes", () => {
    const s = graph.createSession();
    const fn = vi.fn();
    s.subscribe(fn);
    s.batch(() => {
      s.set("/isMember", true);
      s.set("/income", 10);
      s.addItem("/pets", { name: "Rex" });
    });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(s.revision).toBe(1);
    expect(s.value("/youngPets")).toBeUndefined();
  });

  it("undoes everything when a batch throws", () => {
    const s = eligibleWithPets();
    const before = s.allAnswers();
    const fn = vi.fn();
    s.subscribe(fn);
    expect(() =>
      s.batch(() => {
        s.set("/income", 70);
        s.removeItem("/pets", "p1");
        s.set("/income", -5); // invalid
      }),
    ).toThrow(/at least 0/);
    expect(s.allAnswers()).toEqual(before);
    expect(s.value("/benefit")).toBe(15);
    expect(fn).not.toHaveBeenCalled();
  });

  it("nested batches roll back only their own changes", () => {
    const s = graph.createSession();
    s.batch(() => {
      s.set("/isMember", true);
      try {
        s.batch(() => {
          s.set("/income", 5);
          throw new Error("inner");
        });
      } catch {
        // ignored on purpose
      }
    });
    expect(s.allAnswers()).toEqual({ "/isMember": true });
  });

  it("addItem with a name is a single change", () => {
    const s = graph.createSession();
    const fn = vi.fn();
    s.subscribe(fn);
    s.addItem("/pets", { name: "Rex" });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("clear removes every answer", () => {
    const s = eligibleWithPets();
    s.clear();
    expect(s.allAnswers()).toEqual({});
    const fn = vi.fn();
    s.subscribe(fn);
    s.clear();
    expect(fn).not.toHaveBeenCalled();
  });

  it("lists question sections in file order", () => {
    expect(graph.sections()).toEqual(["About you"]);
  });

  it("says a derived fact is not known yet", () => {
    expect(graph.createSession().display("/benefit")).toBe("(not known yet)");
  });
});

describe("snapshots", () => {
  it("round-trips through JSON", () => {
    const s = eligibleWithPets();
    const json = JSON.parse(JSON.stringify(s));
    const restored = graph.createSession(json);
    expect(restored.allAnswers()).toEqual(s.allAnswers());
    expect(restored.value("/benefit")).toBe(s.value("/benefit"));
  });
  it("restores collections before their items, whatever the key order", () => {
    const restored = graph.createSession({
      factfinch: 1,
      rules: { id: "tiny", version: "1.0.0" },
      answers: { "/pets/#a/age": 2, "/pets": ["a"] },
    });
    expect(restored.value("/youngPets")).toBe(1);
  });
  it("restores all or nothing", () => {
    const s = eligibleWithPets();
    const before = s.allAnswers();
    expect(() =>
      s.restore({
        factfinch: 1,
        rules: { id: "tiny", version: "1.0.0" },
        answers: { "/color": "red", "/income": "lots" as never },
      }),
    ).toThrow(/Expected a number/);
    expect(s.allAnswers()).toEqual(before);
  });
  it("rejects unknown snapshot formats", () => {
    expect(() =>
      graph.createSession({ factfinch: 99, rules: { id: "tiny", version: "1" }, answers: {} }),
    ).toThrow(/format 99/);
  });
  it("rejects snapshots for other rules", () => {
    expect(() =>
      graph.createSession({ factfinch: 1, rules: { id: "other", version: "1" }, answers: {} }),
    ).toThrow(/not "tiny"/);
    expect(() => graph.createSession({} as never)).toThrow(/answers/);
  });
});

describe("display and templates", () => {
  it("formats values by type", () => {
    const s = eligibleWithPets();
    s.set("/color", "blue");
    expect(s.display("/income")).toBe("$50");
    expect(s.display("/isMember")).toBe("Yes");
    expect(s.display("/color")).toBe("Blue");
    expect(s.display("/pets")).toBe("Rex, Tom");
    expect(s.display("/youngPets")).toBe("1");
    expect(graph.createSession().display("/income")).toBe("(not answered yet)");
    s.set("/pets", []);
    expect(s.display("/pets")).toBe("None");
  });
  it("renders templates", () => {
    const s = eligibleWithPets();
    expect(
      s.render("{{/income}} / {{/income|number}} / {{const:limit}} / {{/isMember|lower}}"),
    ).toBe("$50 / 50 / 100 / yes");
    expect(s.render("{{./age}} {{item}}", "/pets/#p1")).toBe("1 Rex");
    expect(s.render("[{{item}}][{{./age}}][{{const:nope}}]")).toBe("[][][]");
    expect(s.render("{{/nope}}")).toBe("(unknown)");
  });
});

describe("explanations", () => {
  it("explains a result with the reasons that decided it", () => {
    const s = graph.createSession();
    s.set("/isMember", true);
    s.set("/income", 500);
    const e = s.explain("/benefit");
    expect(e).toMatchObject({
      known: true,
      value: 0,
      display: "$0",
      text: "No benefit.",
      kind: "derived",
    });
    const eligible = e.children[0]!;
    expect(eligible.text).toBe("You are not eligible.");
    // Only the failing reason is listed, not the membership that passed.
    expect(eligible.children.map((c) => c.text ?? c.label)).toEqual([
      "Income of $500 is over $100.",
    ]);
    expect(eligible.children[0]!.children[0]).toMatchObject({
      kind: "input",
      label: "Income",
      display: "$500",
    });
  });

  it("includes collection items and looks through unworded facts", () => {
    const s = eligibleWithPets();
    const [r] = s.results();
    expect(r).toMatchObject({
      fact: "/benefit",
      label: "Benefit",
      known: true,
      value: 15,
      display: "$15",
    });
    const texts = JSON.stringify(r!.explanation);
    expect(texts).toContain("Rex is young.");
    expect(texts).toContain("Tom is not young.");
    expect(texts).toContain("Young pets: 1.");
  });

  it("can leave out inputs and limit depth", () => {
    const s = eligibleWithPets();
    const shallow = s.explain("/benefit", { maxDepth: 1, includeInputs: false });
    expect(shallow.children.every((c) => c.kind === "derived" && c.children.length === 0)).toBe(
      true,
    );
  });

  it("lists what is missing for unknown facts", () => {
    const e = graph.createSession().explain("/benefit");
    expect(e).toMatchObject({ known: false, missing: ["/isMember"], children: [] });
  });
});

describe("parseAnswer", () => {
  const q = (type: string, options?: { value: string; label: string }[]) =>
    ({ type, options, path: "/q" }) as Parameters<typeof parseAnswer>[0];
  it("parses yes/no", () => {
    expect(parseAnswer(q("boolean"), "Yes")).toBe(true);
    expect(parseAnswer(q("boolean"), "n")).toBe(false);
    expect(() => parseAnswer(q("boolean"), "maybe")).toThrow(/yes or no/);
  });
  it("parses money and numbers", () => {
    expect(parseAnswer(q("dollar"), "$1,250.50")).toBe(1250.5);
    expect(parseAnswer(q("integer"), " 7 ")).toBe(7);
    expect(parseAnswer(q("number"), "-3")).toBe(-3);
    expect(parseAnswer(q("number"), ".5")).toBe(0.5);
    expect(parseAnswer(q("dollar"), "12.")).toBe(12);
    expect(() => parseAnswer(q("number"), "1.2.3")).toThrow(/number/);
    expect(() => parseAnswer(q("number"), "abc")).toThrow(/number/);
  });
  it("parses enum choices by number, value or label", () => {
    const opts = [
      { value: "red", label: "Red" },
      { value: "blue", label: "Deep blue" },
    ];
    expect(parseAnswer(q("enum", opts), "2")).toBe("blue");
    expect(parseAnswer(q("enum", opts), "RED")).toBe("red");
    expect(parseAnswer(q("enum", opts), "deep blue")).toBe("blue");
    expect(() => parseAnswer(q("enum", opts), "green")).toThrow(/options/);
  });
  it("parses text and lists", () => {
    expect(parseAnswer(q("string"), "  Sam ")).toBe("Sam");
    expect(parseAnswer(q("collection"), "a, b,,c")).toEqual(["a", "b", "c"]);
  });
});
