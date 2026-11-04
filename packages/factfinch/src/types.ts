/**
 * Types for Factfinch rules files.
 *
 * A rules file is plain JSON. It declares *facts*: things you ask the person
 * (inputs, which have a `question`) and things the engine works out from other
 * facts (derived facts, which have a `derive` expression). Every derived fact can
 * carry plain-language `explain` text that is shown next to the result.
 */

/** The rules-file format version this library understands. */
export const RULES_FORMAT_VERSION = 1;

export type FactType =
  "boolean" | "integer" | "number" | "dollar" | "string" | "enum" | "collection";

/** A value a fact can hold. Collections hold the list of item ids. */
export type Value = boolean | number | string | readonly string[];

export interface EnumOption {
  value: string;
  label: string;
  help?: string;
}

export interface QuestionDef {
  /** The question, in plain words. May contain `{{template}}` references. */
  prompt: string;
  /** Longer help text shown under the question. */
  help?: string;
  /** Groups questions in the UI ("About you", "Income", ...). */
  section?: string;
  /** Labels for yes/no buttons (boolean questions only). */
  trueLabel?: string;
  falseLabel?: string;
  placeholder?: string;
  /** Collection questions only: label for the "add" button, e.g. "Add a child". */
  addLabel?: string;
  /** Collection questions only: what one item is called, e.g. "child". */
  itemNoun?: string;
}

export interface ExplainDef {
  /** Shown when a boolean fact is true. */
  true?: string;
  /** Shown when a boolean fact is false. */
  false?: string;
  /** Shown when a number fact is exactly 0. Falls back to `known`. */
  zero?: string;
  /** Shown whenever the fact is known (for non-boolean facts, or as a fallback). */
  known?: string;
}

export interface FactDef {
  type: FactType;
  /** Short noun phrase used in explanations, e.g. "Earned income". */
  label?: string;
  description?: string;
  /** Present on input facts: what to ask. */
  question?: QuestionDef;
  /** Present on derived facts: how to work it out. */
  derive?: Expr;
  /** Enum facts: allowed values. */
  options?: EnumOption[];
  /** Number facts: inclusive bounds for answers. */
  min?: number;
  max?: number;
  /** String facts: maximum answer length. */
  maxLength?: number;
  /** Plain-language explanation templates. */
  explain?: ExplainDef;
  /** Collection facts: item fact (relative name, e.g. "name") used to label items. */
  itemName?: string;
  /** Collection facts: maximum number of items. */
  maxItems?: number;
  /** Free-form notes for rule authors (citations, simplifications). Ignored by the engine. */
  notes?: string | string[];
}

export interface ResultDef {
  fact: string;
  label: string;
  description?: string;
}

export interface RulesFile {
  $schema?: string;
  factfinch: number;
  id: string;
  title: string;
  version: string;
  description?: string;
  disclaimer?: string;
  /** Where the numbers come from (IRS publications, statutes). */
  sources?: { title: string; url?: string }[];
  constants?: Record<string, number | string | boolean>;
  tables?: Record<string, Record<string, number | string | boolean>>;
  facts: Record<string, FactDef>;
  results: ResultDef[];
}

// ---------------------------------------------------------------------------
// Expressions
// ---------------------------------------------------------------------------

export type Literal = number | string | boolean;

/**
 * A derive expression. Each operator is a single-key JSON object.
 * Fact references are absolute (`/income/wages`) or, inside a collection item,
 * relative to that item (`./age`).
 */
export type Expr =
  | Literal
  | { fact: string }
  | { const: string }
  | { and: Expr[] }
  | { or: Expr[] }
  | { not: Expr }
  | { if: [Expr, Expr, Expr] }
  | { eq: [Expr, Expr] }
  | { neq: [Expr, Expr] }
  | { gt: [Expr, Expr] }
  | { gte: [Expr, Expr] }
  | { lt: [Expr, Expr] }
  | { lte: [Expr, Expr] }
  | { in: [Expr, Literal[]] }
  | { add: Expr[] }
  | { sub: [Expr, Expr] }
  | { mul: Expr[] }
  | { div: [Expr, Expr] }
  | { min: Expr[] }
  | { max: Expr[] }
  | { round: Expr }
  | { floor: Expr }
  | { ceil: Expr }
  | { count: { in: string; where?: Expr } }
  | { sum: { in: string; of: Expr; where?: Expr } }
  | { lookup: { table: string; key: Expr; default?: Expr } };

export const OPERATORS = [
  "fact",
  "const",
  "and",
  "or",
  "not",
  "if",
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "add",
  "sub",
  "mul",
  "div",
  "min",
  "max",
  "round",
  "floor",
  "ceil",
  "count",
  "sum",
  "lookup",
] as const;

export type Operator = (typeof OPERATORS)[number];

// ---------------------------------------------------------------------------
// Evaluation results
// ---------------------------------------------------------------------------

/** A fact whose value is settled. `deps` are the facts that decided it. */
export interface KnownResult {
  known: true;
  value: Value;
  deps: string[];
}

/**
 * A fact that can't be settled yet. `missing` lists the unanswered input facts
 * (concrete paths) that could settle it, in the order they would be asked.
 */
export interface UnknownResult {
  known: false;
  missing: string[];
  deps: string[];
}

export type Result = KnownResult | UnknownResult;
