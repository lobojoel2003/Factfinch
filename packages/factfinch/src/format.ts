import type { FactDef, Value } from "./types.js";

export type FormatName = "dollar" | "number" | "percent" | "yesno" | "lower" | "raw";

const dollars = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});
const numbers = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 });

export function formatDollar(n: number): string {
  // Whole dollars print without cents; fractional amounts keep two places.
  return Number.isInteger(n)
    ? dollars.format(n)
    : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

/** Turn a value into plain words, using the fact's type and enum labels. */
export function formatValue(value: Value | undefined, def?: FactDef, format?: FormatName): string {
  if (value === undefined) return "(not answered yet)";
  if (format === "raw") return Array.isArray(value) ? value.join(", ") : String(value);
  if (typeof value === "boolean") {
    const text = value ? "yes" : "no";
    return format === "lower" || format === "yesno" ? text : text[0]!.toUpperCase() + text.slice(1);
  }
  if (typeof value === "number") {
    if (format === "percent") return `${numbers.format(value * 100)}%`;
    if (format === "dollar" || (format === undefined && def?.type === "dollar")) {
      return formatDollar(value);
    }
    return numbers.format(value);
  }
  if (Array.isArray(value)) {
    return value.length === 1 ? "1 item" : `${value.length} items`;
  }
  const str = value as string;
  if (def?.type === "enum") {
    const label = def.options?.find((o) => o.value === str)?.label ?? str;
    return format === "lower" ? label.toLowerCase() : label;
  }
  return format === "lower" ? str.toLowerCase() : str;
}
