/**
 * Factfinch — a plain-language interview engine.
 *
 * Describe rules as data, ask only the questions still needed, and explain
 * every result in plain words.
 *
 * @example
 * ```ts
 * import { FactGraph } from "factfinch";
 * import rules from "factfinch/rules/us-eitc-ctc-2025.json" with { type: "json" };
 *
 * const session = FactGraph.load(rules).createSession();
 * let q;
 * while ((q = session.nextQuestion())) session.set(q.path, await ask(q));
 * for (const r of session.results()) console.log(r.label, r.display);
 * ```
 */
export { FactGraph } from "./graph.js";
export { Session } from "./session.js";
export type { Question, ResultView, SessionSnapshot } from "./session.js";
export type { Explanation, ExplainOptions } from "./explain.js";
export { validateAnswer, parseAnswer } from "./answers.js";
export type { ParseTarget } from "./answers.js";
export { validateRules } from "./validate.js";
export { runCase, runCases } from "./testing.js";
export type { TestCase, CasesFile, CaseResult } from "./testing.js";
export { formatValue, formatDollar } from "./format.js";
export type { FormatName } from "./format.js";
export { renderTemplate, templateRefs } from "./template.js";
export { FactfinchError, RulesError } from "./errors.js";
export type { ErrorCode, RulesIssue } from "./errors.js";
export { RULES_FORMAT_VERSION, OPERATORS } from "./types.js";
export type {
  RulesFile,
  FactDef,
  FactType,
  QuestionDef,
  ExplainDef,
  EnumOption,
  ResultDef,
  Expr,
  Literal,
  Operator,
  Value,
  Result,
  KnownResult,
  UnknownResult,
} from "./types.js";
export { BUILD_INFO } from "./build-info.js";

import { BUILD_INFO } from "./build-info.js";
/** The library version, e.g. "0.1.0". */
export const VERSION: string = BUILD_INFO.version;
