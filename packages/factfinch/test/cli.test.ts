import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cli, HELP, type CliIO } from "../src/cli.js";
import { BUILD_INFO } from "../src/index.js";
import { tinyRules } from "./fixtures.js";

const RULES = join(__dirname, "../rules/us-eitc-ctc-2025.json");
const CASES = join(__dirname, "../rules/us-eitc-ctc-2025.cases.json");

/** Run the CLI against in-memory files and scripted input. */
async function run(
  argv: string[],
  opts: { files?: Record<string, string>; input?: string[] } = {},
) {
  const out: string[] = [];
  const err: string[] = [];
  const input = [...(opts.input ?? [])];
  const io: CliIO = {
    out: (l) => out.push(l),
    err: (l) => err.push(l),
    readFile: (path) => {
      if (opts.files && path in opts.files) return opts.files[path]!;
      return readFileSync(path, "utf8");
    },
    readLine: async (prompt) => {
      const line = input.shift();
      if (line !== undefined) out.push(prompt + line);
      return line;
    },
    color: false,
  };
  const code = await cli(argv, io);
  return { code, out: out.join("\n"), err: err.join("\n") };
}

describe("factfinch CLI", () => {
  it("prints help and version", async () => {
    expect((await run([])).out).toBe(HELP);
    expect((await run(["--help"])).code).toBe(0);
    const v = await run(["--version"]);
    expect(v.out).toBe(`${BUILD_INFO.version}+build.${BUILD_INFO.build} (${BUILD_INFO.commit})`);
  });

  it("rejects unknown commands and missing files with usage help", async () => {
    const bad = await run(["frobnicate"]);
    expect(bad.code).toBe(2);
    expect(bad.err).toContain('Unknown command "frobnicate"');
    expect((await run(["validate"])).code).toBe(2);
    expect((await run(["test", RULES])).err).toContain("Missing the cases file");
  });

  it("reports unreadable and invalid JSON files", async () => {
    const missing = await run(["validate", "/no/such/file.json"]);
    expect(missing.code).toBe(1);
    expect(missing.err).toMatch(/Could not read \/no\/such\/file.json/);
    const broken = await run(["validate", "x.json"], { files: { "x.json": "{nope" } });
    expect(broken.err).toMatch(/x.json is not valid JSON/);
  });

  it("validates rules", async () => {
    expect(await run(["validate", RULES])).toMatchObject({ code: 0, out: `✓ ${RULES} is valid` });
    const files = { "bad.json": JSON.stringify({ ...tinyRules, results: [] }) };
    const bad = await run(["validate", "bad.json"], { files });
    expect(bad).toMatchObject({ code: 1, out: "✗ results: must be a non-empty array" });
    const asJson = JSON.parse((await run(["validate", "bad.json", "--json"], { files })).out);
    expect(asJson).toEqual({
      valid: false,
      issues: [{ where: "results", message: "must be a non-empty array" }],
    });
  });

  it("prints rules errors when loading fails", async () => {
    const files = { "bad.json": JSON.stringify({ ...tinyRules, results: [] }) };
    const r = await run(["run", "bad.json", "a.json"], { files });
    expect(r.code).toBe(1);
    expect(r.err).toContain("✗ results: must be a non-empty array");
  });

  it("runs known cases", async () => {
    const r = await run(["test", RULES, CASES]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/\d+ passed, 0 failed$/);
    const json = JSON.parse((await run(["test", RULES, CASES, "--json"])).out);
    expect(json.failed).toBe(0);
    expect(json.results[0]).toHaveProperty("asked");
  });

  it("fails when a case fails", async () => {
    const files = {
      "c.json": JSON.stringify({
        cases: [
          {
            name: "wrong",
            answers: { "/you/claimedAsDependent": true },
            expect: { "/eitc/amount": 1 },
          },
        ],
      }),
    };
    const r = await run(["test", RULES, "c.json"], { files });
    expect(r.code).toBe(1);
    expect(r.out).toContain("✗ wrong");
    expect(r.out).toContain("expected 1, got 0");
  });

  it("runs saved answers, in plain or snapshot form", async () => {
    const files = { "a.json": JSON.stringify({ "/you/claimedAsDependent": true }) };
    const r = await run(["run", RULES, "a.json"], { files });
    expect(r.out).toContain("Earned Income Tax Credit: $0");
    expect(r.out).toContain("Someone else can claim you as a dependent.");

    const partial = {
      "p.json": JSON.stringify({ factfinch: 1, answers: { "/you/claimedAsDependent": false } }),
    };
    const p = await run(["run", RULES, "p.json"], { files: partial });
    expect(p.out).toContain("Still needed:");
    const pj = JSON.parse((await run(["run", RULES, "p.json", "--json"], { files: partial })).out);
    expect(pj.complete).toBe(false);
    expect(pj.pending[0].path).toBe("/you/hasSsn");
  });

  it("runs an interview from scripted input, re-asking after bad answers", async () => {
    const r = await run(["ask", RULES], {
      input: [
        "maybe", // not yes/no: asked again
        "no",
        "yes",
        "2", // head of household
        "yes",
        "lots", // not a number of children
        "1",
        "Leo",
        "1",
        "6",
        "32",
        "yes",
        "no",
        "no",
        "yes",
        "yes",
        "24000",
        "no",
        "0",
        "no",
        "yes",
      ],
    });
    expect(r.code).toBe(0);
    expect(r.out).toContain("Please answer yes or no");
    expect(r.out).toContain("Please enter a whole number.");
    expect(r.out).toContain("How is Leo related to you?");
    expect(r.out).toContain("Earned Income Tax Credit: $4,220");
    expect(r.out).toContain("Child Tax Credit and credit for other dependents: $2,200");
  });

  it("stops cleanly when input ends early", async () => {
    const r = await run(["ask", RULES], { input: ["no"] });
    expect(r.code).toBe(1);
    expect(r.err).toBe("Input ended before the interview finished.");
  });
});
