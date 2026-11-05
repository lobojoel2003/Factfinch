import type { FactDef, Value } from "./types.js";

/** A plain-language explanation tree for one fact. */
export interface Explanation {
  path: string;
  kind: "input" | "derived";
  /** A short name for the fact, or the question that was asked. */
  label: string;
  known: boolean;
  value?: Value;
  /** The value in plain words: "$4,328", "Yes", "Head of household". */
  display: string;
  /** The rule's explanation sentence, when the rules file provides one. */
  text?: string;
  /** The facts that decided this one. */
  children: Explanation[];
  /** Unknown facts only: questions that still need answers. */
  missing?: string[];
}

export interface ExplainOptions {
  /** How many levels of reasons to include. Default 8. */
  maxDepth?: number;
  /** Include answered questions as leaves. Default true. */
  includeInputs?: boolean;
}

/**
 * The explanation template the rules give for a value, exactly as written:
 * `undefined` when there is none, `""` when the author asked for silence.
 * Booleans use `true`/`false`, numbers use `zero` for 0; both fall back to `known`.
 */
export function explanationTemplate(def: FactDef, value: Value): string | undefined {
  const e = def.explain;
  if (!e) return undefined;
  if (typeof value === "boolean") return (value ? e.true : e.false) ?? e.known;
  if (value === 0) return e.zero ?? e.known;
  return e.known;
}
