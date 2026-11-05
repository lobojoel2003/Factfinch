/**
 * Checking and parsing answers.
 *
 * `validateAnswer` is what `Session.set` uses to reject bad values;
 * `parseAnswer` turns typed text (from a terminal or a plain text box) into a
 * value of the right type.
 */
import { FactfinchError } from "./errors.js";
import { isValidItemId } from "./paths.js";
import type { EnumOption, FactDef, FactType, Value } from "./types.js";

function invalid(path: string, message: string): never {
  throw new FactfinchError("INVALID_ANSWER", message, path);
}

/** Check an answer against its fact definition and return a clean copy. */
export function validateAnswer(def: FactDef, value: unknown, path: string): Value {
  switch (def.type) {
    case "boolean":
      if (typeof value !== "boolean") invalid(path, "Expected yes or no");
      return value;
    case "integer":
    case "number":
    case "dollar": {
      if (typeof value !== "number" || !Number.isFinite(value)) invalid(path, "Expected a number");
      if (def.type === "integer" && !Number.isInteger(value)) {
        invalid(path, "Expected a whole number");
      }
      if (def.min !== undefined && value < def.min) invalid(path, `Must be at least ${def.min}`);
      if (def.max !== undefined && value > def.max) invalid(path, `Must be at most ${def.max}`);
      return value;
    }
    case "string":
      if (typeof value !== "string") invalid(path, "Expected text");
      if (def.maxLength !== undefined && value.length > def.maxLength) {
        invalid(path, `Must be at most ${def.maxLength} characters`);
      }
      return value;
    case "enum":
      if (typeof value !== "string" || !def.options?.some((o) => o.value === value)) {
        invalid(path, `Expected one of: ${(def.options ?? []).map((o) => o.value).join(", ")}`);
      }
      return value;
    case "collection": {
      if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) {
        invalid(path, "Expected a list of item ids");
      }
      const ids = value as string[];
      if (new Set(ids).size !== ids.length) invalid(path, "Item ids must be unique");
      const bad = ids.find((id) => !isValidItemId(id));
      if (bad !== undefined) {
        invalid(path, `Invalid item id "${bad}" (use letters, digits, _ or -)`);
      }
      if (def.maxItems !== undefined && ids.length > def.maxItems) {
        invalid(path, `At most ${def.maxItems} items`);
      }
      return [...ids];
    }
  }
}

/** The parts of a question `parseAnswer` needs. */
export interface ParseTarget {
  type: FactType;
  path: string;
  options?: EnumOption[];
}

/**
 * Turn typed text into an answer value: "yes" -> true, "$1,250.50" -> 1250.5,
 * "2" -> the 2nd enum option. Throws INVALID_ANSWER when the text doesn't fit.
 * Bounds (min/max) are checked later, by `Session.set`.
 */
export function parseAnswer(question: ParseTarget, text: string): Value {
  const t = text.trim();
  switch (question.type) {
    case "boolean":
      if (/^(y|yes|true|1)$/i.test(t)) return true;
      if (/^(n|no|false|0)$/i.test(t)) return false;
      return invalid(question.path, "Please answer yes or no");
    case "integer":
    case "number":
    case "dollar": {
      const cleaned = t.replace(/[$,\s]/g, "");
      if (!/^-?(\d+\.?\d*|\.\d+)$/.test(cleaned)) {
        return invalid(question.path, "Please enter a number");
      }
      return Number(cleaned);
    }
    case "enum": {
      const opts = question.options ?? [];
      const lower = t.toLowerCase();
      const match =
        (/^\d+$/.test(t) ? opts[Number(t) - 1] : undefined) ??
        opts.find((o) => o.value.toLowerCase() === lower || o.label.toLowerCase() === lower);
      if (!match) return invalid(question.path, "Please pick one of the options");
      return match.value;
    }
    case "string":
      return t;
    case "collection":
      return t
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
  }
}
