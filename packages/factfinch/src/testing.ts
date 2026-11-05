/**
 * Known-case testing for rules files.
 *
 * A cases file lists people (as answers) and the results the rules must give
 * them. Each case is run as a real interview: the engine asks its questions one
 * at a time and the case's answers are used to reply. That checks two things at
 * once — the numbers are right, and the engine only asked what it needed.
 */
import { FactfinchError } from "./errors.js";
import type { FactGraph } from "./graph.js";
import type { Value } from "./types.js";

export interface TestCase {
  name: string;
  description?: string;
  /** Free-form labels, e.g. "example" for cases a demo can offer. */
  tags?: string[];
  /** Answers keyed by concrete path. Collections are lists of item ids. */
  answers: Record<string, Value>;
  /** Expected values for any facts, keyed by concrete path. */
  expect: Record<string, Value>;
  /** Questions that must NOT be asked for this person. */
  expectNotAsked?: string[];
  /** Exact question order, when it matters. */
  expectAsked?: string[];
}

export interface CasesFile {
  $schema?: string;
  rules?: string;
  cases: TestCase[];
}

export interface CaseResult {
  name: string;
  passed: boolean;
  failures: string[];
  /** Questions asked, in order. */
  asked: string[];
}

const TOLERANCE = 0.005;

function same(a: Value | undefined, b: Value): boolean {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) <= TOLERANCE;
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((x, i) => x === b[i]);
  return a === b;
}

/** Run one case as a full interview. */
export function runCase(graph: FactGraph, tc: TestCase): CaseResult {
  const failures: string[] = [];
  const asked: string[] = [];
  const session = graph.createSession();
  const limit = 500;

  try {
    for (let step = 0; step < limit; step++) {
      const q = session.nextQuestion();
      if (!q) break;
      asked.push(q.path);
      if (!(q.path in tc.answers)) {
        failures.push(`asked "${q.path}" (${q.prompt}) but the case has no answer for it`);
        break;
      }
      session.set(q.path, tc.answers[q.path]!);
      // Like a UI that asks for names while adding items, fill in item names.
      const nameField = graph.definition(q.path)?.itemName;
      if (q.type === "collection" && nameField) {
        for (const id of session.items(q.path)) {
          const namePath = `${q.path}/#${id}/${nameField}`;
          const name = tc.answers[namePath];
          if (typeof name === "string") session.set(namePath, name);
        }
      }
      if (step === limit - 1) failures.push("interview did not finish after 500 questions");
    }
  } catch (err) {
    failures.push(err instanceof FactfinchError ? err.message : String(err));
  }

  for (const [path, expected] of Object.entries(tc.expect)) {
    try {
      const r = session.get(path);
      if (!r.known)
        failures.push(`${path}: expected ${JSON.stringify(expected)}, but it is still unknown`);
      else if (!same(r.value, expected)) {
        failures.push(
          `${path}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(r.value)}`,
        );
      }
    } catch (err) {
      failures.push(`${path}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  for (const path of tc.expectNotAsked ?? []) {
    if (asked.includes(path)) failures.push(`asked "${path}", which should not be needed`);
  }
  if (tc.expectAsked && JSON.stringify(tc.expectAsked) !== JSON.stringify(asked)) {
    failures.push(
      `question order differs.\n    expected: ${tc.expectAsked.join(", ")}\n    actual:   ${asked.join(", ")}`,
    );
  }
  return { name: tc.name, passed: failures.length === 0, failures, asked };
}

/** Run every case in a cases file. */
export function runCases(graph: FactGraph, file: CasesFile): CaseResult[] {
  if (file.rules && file.rules !== graph.id) {
    return [
      {
        name: "(cases file)",
        passed: false,
        failures: [`cases are for rules "${file.rules}", not "${graph.id}"`],
        asked: [],
      },
    ];
  }
  return file.cases.map((tc) => runCase(graph, tc));
}
