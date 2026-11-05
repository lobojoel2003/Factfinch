import { FactfinchError } from "factfinch";

/** Engine messages end with the path, e.g. "Must be at least 0 (/income/wages)". */
export function friendlyError(err: unknown): string {
  if (err instanceof FactfinchError) return `${err.message.replace(/\s*\(\/[^)]*\)$/, "")}.`;
  return "Something went wrong. Please try again.";
}
