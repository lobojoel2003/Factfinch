import type { RulesIssue } from "./errors.js";
import { itemContextOf, resolveRef, segments, toDefinitionPath } from "./paths.js";
import { templateRefs } from "./template.js";
import { OPERATORS, RULES_FORMAT_VERSION } from "./types.js";
import type { FactDef, RulesFile } from "./types.js";

const FACT_TYPES = new Set([
  "boolean",
  "integer",
  "number",
  "dollar",
  "string",
  "enum",
  "collection",
]);
const OPS = new Set<string>(OPERATORS);
const PATH_RE = /^(\/[A-Za-z_][A-Za-z0-9_]*|\/\*)+$/;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Check a rules file without running it. Returns a list of problems; an empty
 * list means the file is safe to load.
 */
export function validateRules(input: unknown): RulesIssue[] {
  const issues: RulesIssue[] = [];
  const add = (where: string, message: string) => issues.push({ where, message });

  if (!isObject(input)) {
    add("(root)", "rules must be a JSON object");
    return issues;
  }
  const rules = input as unknown as RulesFile;

  if (rules.factfinch !== RULES_FORMAT_VERSION) {
    add(
      "factfinch",
      `expected format version ${RULES_FORMAT_VERSION}, got ${String(rules.factfinch)}`,
    );
  }
  for (const key of ["id", "title", "version"] as const) {
    if (typeof rules[key] !== "string" || rules[key].length === 0) {
      add(key, "must be a non-empty string");
    }
  }
  if (!isObject(rules.facts)) {
    add("facts", "must be an object mapping paths to fact definitions");
    return issues;
  }
  if (!Array.isArray(rules.results) || rules.results.length === 0) {
    add("results", "must be a non-empty array");
  }

  const constants = isObject(rules.constants) ? rules.constants : {};
  const tables = isObject(rules.tables) ? rules.tables : {};
  if (rules.constants !== undefined && !isObject(rules.constants))
    add("constants", "must be an object");
  if (rules.tables !== undefined && !isObject(rules.tables)) add("tables", "must be an object");
  for (const [name, table] of Object.entries(tables)) {
    if (!isObject(table)) add(`tables.${name}`, "must be an object of key -> value");
  }

  const facts = rules.facts as Record<string, FactDef>;
  const defs = new Map(Object.entries(facts));

  // --- Per-fact checks --------------------------------------------------------
  for (const [path, def] of defs) {
    const where = `facts.${path}`;
    if (!PATH_RE.test(path)) {
      add(where, "fact paths look like /name or /collection/*/name (letters, digits, _)");
      continue;
    }
    if (!isObject(def)) {
      add(where, "must be an object");
      continue;
    }
    if (!FACT_TYPES.has(def.type)) {
      add(`${where}.type`, `unknown type "${String(def.type)}"`);
      continue;
    }
    // Every `*` must follow a collection fact.
    const segs = segments(path);
    segs.forEach((s, i) => {
      if (s !== "*") return;
      const parent = "/" + segs.slice(0, i).join("/");
      if (defs.get(parent)?.type !== "collection") {
        add(where, `"${parent}" must be a collection fact to use /*/ under it`);
      }
    });
    if (segs[segs.length - 1] === "*") add(where, "a path cannot end in *");

    const isInput = def.question !== undefined;
    const isDerived = def.derive !== undefined;
    if (isInput === isDerived) {
      add(where, "a fact needs exactly one of `question` (asked) or `derive` (worked out)");
    }
    if (def.type === "collection" && isDerived) {
      add(where, "collections are asked, not derived");
    }
    if (isInput) {
      if (
        !isObject(def.question) ||
        typeof def.question.prompt !== "string" ||
        !def.question.prompt
      ) {
        add(`${where}.question.prompt`, "must be a non-empty string");
      } else {
        checkTemplate(def.question.prompt, path, `${where}.question.prompt`);
        if (def.question.help) checkTemplate(def.question.help, path, `${where}.question.help`);
      }
    }
    if (def.type === "enum") {
      if (isInput && (!Array.isArray(def.options) || def.options.length === 0)) {
        add(`${where}.options`, "enum questions need at least one option");
      }
      const seen = new Set<string>();
      for (const opt of def.options ?? []) {
        if (!isObject(opt) || typeof opt.value !== "string" || typeof opt.label !== "string") {
          add(`${where}.options`, "each option needs a string `value` and `label`");
        } else if (seen.has(opt.value)) {
          add(`${where}.options`, `duplicate option "${opt.value}"`);
        } else seen.add(opt.value);
      }
    }
    if (def.min !== undefined && typeof def.min !== "number")
      add(`${where}.min`, "must be a number");
    if (def.max !== undefined && typeof def.max !== "number")
      add(`${where}.max`, "must be a number");
    if (typeof def.min === "number" && typeof def.max === "number" && def.min > def.max) {
      add(where, "min is greater than max");
    }
    if (def.type === "collection" && def.itemName !== undefined) {
      const target = `${path}/*/${def.itemName}`;
      if (!defs.has(target)) add(`${where}.itemName`, `no fact named ${target}`);
    }
    if (def.explain !== undefined) {
      if (!isObject(def.explain)) add(`${where}.explain`, "must be an object");
      else {
        for (const [k, text] of Object.entries(def.explain)) {
          if (!["true", "false", "zero", "known"].includes(k)) {
            add(`${where}.explain.${k}`, "use true, false, zero or known");
          } else if (typeof text !== "string") add(`${where}.explain.${k}`, "must be a string");
          else checkTemplate(text, path, `${where}.explain.${k}`);
        }
      }
    }
    if (isDerived) checkExpr(def.derive, itemContextOf(path), `${where}.derive`);
  }

  // --- Results ------------------------------------------------------------------
  (Array.isArray(rules.results) ? rules.results : []).forEach((r, i) => {
    if (!isObject(r) || typeof r.fact !== "string" || typeof r.label !== "string") {
      add(`results[${i}]`, "needs a string `fact` and `label`");
    } else if (!defs.has(r.fact)) add(`results[${i}].fact`, `no fact named ${r.fact}`);
    else if (r.fact.includes("*")) add(`results[${i}].fact`, "results must be top-level facts");
  });

  // --- Cycles -----------------------------------------------------------------
  const graph = new Map<string, string[]>();
  for (const [path, def] of defs) {
    if (isObject(def) && def.derive !== undefined) {
      graph.set(path, collectRefs(def.derive, itemContextOf(path)));
    }
  }
  const state = new Map<string, 1 | 2>();
  const visit = (node: string, trail: string[]): void => {
    if (state.get(node) === 2) return;
    if (state.get(node) === 1) {
      add(`facts.${node}`, `circular definition: ${[...trail, node].join(" -> ")}`);
      return;
    }
    state.set(node, 1);
    for (const next of graph.get(node) ?? []) if (graph.has(next)) visit(next, [...trail, node]);
    state.set(node, 2);
  };
  for (const node of graph.keys()) visit(node, []);

  return issues;

  // --- Helpers ----------------------------------------------------------------

  function checkRef(ref: unknown, ctx: string | undefined, where: string): string | undefined {
    if (typeof ref !== "string") {
      add(where, "fact reference must be a string");
      return undefined;
    }
    if (ref.includes("*")) {
      add(where, `"${ref}" means every item; use ./name for this item, or count/sum`);
      return undefined;
    }
    const resolved = resolveRef(ref, ctx);
    if (!resolved) {
      add(where, `"${ref}" must start with / (or ./ inside a collection item)`);
      return undefined;
    }
    const defPath = toDefinitionPath(resolved);
    if (!defs.has(defPath)) {
      add(where, `no fact named ${defPath}`);
      return undefined;
    }
    return defPath;
  }

  function checkTemplate(text: string, factPath: string, where: string): void {
    for (const ref of templateRefs(text)) {
      if (ref.startsWith("const:")) {
        if (!(ref.slice(6) in constants)) add(where, `no constant named ${ref.slice(6)}`);
      } else if (ref === "item") {
        if (!itemContextOf(factPath)) add(where, "{{item}} only works inside a collection item");
      } else checkRef(ref, itemContextOf(factPath), where);
    }
  }

  function checkList(
    e: unknown,
    op: string,
    ctx: string | undefined,
    where: string,
    arity?: number,
  ) {
    if (!Array.isArray(e)) {
      add(where, `"${op}" takes an array`);
      return;
    }
    if (arity !== undefined && e.length !== arity) {
      add(where, `"${op}" takes exactly ${arity} arguments, got ${e.length}`);
    } else if (arity === undefined && e.length === 0) {
      add(where, `"${op}" needs at least one argument`);
    }
    e.forEach((x, i) => checkExpr(x, ctx, `${where}[${i}]`));
  }

  function checkExpr(e: unknown, ctx: string | undefined, where: string): void {
    if (typeof e === "number" || typeof e === "string" || typeof e === "boolean") return;
    if (!isObject(e)) {
      add(where, "expression must be a number, string, boolean or {operator: ...} object");
      return;
    }
    const keys = Object.keys(e);
    if (keys.length !== 1 || !OPS.has(keys[0]!)) {
      add(where, `expression must have exactly one operator key, got {${keys.join(", ")}}`);
      return;
    }
    const op = keys[0]!;
    const arg = e[op];
    const at = `${where}.${op}`;
    switch (op) {
      case "fact":
        checkRef(arg, ctx, at);
        return;
      case "const":
        if (typeof arg !== "string" || !(arg in constants))
          add(at, `no constant named ${String(arg)}`);
        return;
      case "and":
      case "or":
      case "add":
      case "mul":
      case "min":
      case "max":
        return checkList(arg, op, ctx, at);
      case "not":
      case "round":
      case "floor":
      case "ceil":
        return checkExpr(arg, ctx, at);
      case "if":
        return checkList(arg, op, ctx, at, 3);
      case "eq":
      case "neq":
      case "gt":
      case "gte":
      case "lt":
      case "lte":
      case "sub":
      case "div":
        return checkList(arg, op, ctx, at, 2);
      case "in": {
        if (!Array.isArray(arg) || arg.length !== 2 || !Array.isArray(arg[1])) {
          add(at, `"in" takes [expression, [literal, ...]]`);
          return;
        }
        checkExpr(arg[0], ctx, `${at}[0]`);
        return;
      }
      case "count":
      case "sum": {
        if (!isObject(arg)) {
          add(at, `"${op}" takes {in, ${op === "sum" ? "of, " : ""}where?}`);
          return;
        }
        const coll = checkRef(arg.in, ctx, `${at}.in`);
        if (coll && defs.get(coll)?.type !== "collection") {
          add(`${at}.in`, `${coll} is not a collection`);
          return;
        }
        if (!coll) return;
        const itemCtx = `${resolveRef(arg.in as string, ctx)}/*`;
        if (op === "sum") {
          if (arg.of === undefined) add(at, `"sum" needs "of"`);
          else checkExpr(arg.of, itemCtx, `${at}.of`);
        }
        if (arg.where !== undefined) checkExpr(arg.where, itemCtx, `${at}.where`);
        return;
      }
      case "lookup": {
        if (!isObject(arg) || typeof arg.table !== "string") {
          add(at, `"lookup" takes {table, key, default?}`);
          return;
        }
        if (!(arg.table in tables)) add(`${at}.table`, `no table named ${arg.table}`);
        checkExpr(arg.key, ctx, `${at}.key`);
        if (arg.default !== undefined) checkExpr(arg.default, ctx, `${at}.default`);
        return;
      }
    }
  }
}

/** All definition paths an expression reads (used for cycle detection). */
export function collectRefs(e: unknown, ctx: string | undefined): string[] {
  const out: string[] = [];
  const walk = (x: unknown, c: string | undefined): void => {
    if (Array.isArray(x)) return x.forEach((y) => walk(y, c));
    if (!isObject(x)) return;
    const [op] = Object.keys(x);
    if (!op) return;
    const arg = x[op];
    if (op === "fact" && typeof arg === "string") {
      const r = resolveRef(arg, c);
      if (r) out.push(toDefinitionPath(r));
    } else if ((op === "count" || op === "sum") && isObject(arg) && typeof arg.in === "string") {
      const r = resolveRef(arg.in, c);
      if (!r) return;
      out.push(toDefinitionPath(r));
      walk(arg.of, `${r}/*`);
      walk(arg.where, `${r}/*`);
    } else if (op === "lookup" && isObject(arg)) {
      walk(arg.key, c);
      walk(arg.default, c);
    } else if (op === "in" && Array.isArray(arg)) {
      walk(arg[0], c);
    } else if (op !== "const") walk(arg, c);
  };
  walk(e, ctx);
  return out;
}
