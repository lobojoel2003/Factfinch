export type ErrorCode =
  | "INVALID_RULES"
  | "UNKNOWN_FACT"
  | "NOT_AN_INPUT"
  | "INVALID_ANSWER"
  | "UNKNOWN_ITEM"
  | "EVALUATION_ERROR"
  | "CYCLE"
  | "INVALID_SNAPSHOT";

/** All errors thrown by Factfinch carry a stable `code`. */
export class FactfinchError extends Error {
  readonly code: ErrorCode;
  readonly path: string | undefined;

  constructor(code: ErrorCode, message: string, path?: string) {
    super(path ? `${message} (${path})` : message);
    this.name = "FactfinchError";
    this.code = code;
    this.path = path;
  }
}

export interface RulesIssue {
  /** Where in the rules file the problem is, e.g. `facts./eitc/amount.derive`. */
  where: string;
  message: string;
}

/** Thrown by `FactGraph.load` when a rules file has problems. */
export class RulesError extends FactfinchError {
  readonly issues: RulesIssue[];

  constructor(issues: RulesIssue[]) {
    const head = issues
      .slice(0, 5)
      .map((i) => `  - ${i.where}: ${i.message}`)
      .join("\n");
    const more = issues.length > 5 ? `\n  ...and ${issues.length - 5} more` : "";
    super("INVALID_RULES", `Rules file has ${issues.length} problem(s):\n${head}${more}`);
    this.name = "RulesError";
    this.issues = issues;
  }
}
