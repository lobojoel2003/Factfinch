import { FactGraph, type CasesFile, type Value } from "factfinch";
import casesJson from "factfinch/rules/us-eitc-ctc-2025.cases.json";
import rules from "factfinch/rules/us-eitc-ctc-2025.json";

/** The loaded EITC / Child Tax Credit rules. */
export const graph = FactGraph.load(rules);

/** Headline facts the results page leads with (defined in the rules file). */
export const SUMMARY = {
  total: "/summary/totalCredits",
  refundable: "/summary/refundableCredits",
} as const;

/** Steps shown in the progress bar: the rules' question sections, then results. */
export const STEPS = [...graph.sections(), "Your results"];

export interface Example {
  name: string;
  answers: Record<string, Value>;
}

/** Sample households: the known cases tagged "example" in the rules' cases file. */
export const examples: Example[] = (casesJson as unknown as CasesFile).cases
  .filter((c) => c.tags?.includes("example"))
  .map((c) => ({ name: c.name, answers: c.answers }));

export const REPO_URL = "https://github.com/lobojoel2003/Factfinch";
