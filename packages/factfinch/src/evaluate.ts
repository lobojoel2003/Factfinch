/**
 * The evaluator works out facts from incomplete answers.
 *
 * Every expression evaluates to either a known value, or "unknown" together
 * with the list of unanswered questions that could settle it. Logic
 * short-circuits on what *is* known: `and` is false as soon as one part is
 * false, no matter how many other parts are unanswered. That is what lets the
 * interview skip questions that can no longer change the outcome.
 */
import { FactfinchError } from "./errors.js";
import { itemContextOf, itemPath, itemsInPath, resolveRef, toDefinitionPath } from "./paths.js";
import type {
  Expr,
  FactDef,
  KnownResult,
  Result,
  RulesFile,
  UnknownResult,
  Value,
} from "./types.js";

function uniq(items: string[]): string[] {
  return [...new Set(items)];
}

function known(value: Value, deps: string[] = []): KnownResult {
  return { known: true, value, deps: uniq(deps) };
}

function unknown(results: Result[], deps: string[] = []): UnknownResult {
  const missing: string[] = [];
  for (const r of results) if (!r.known) missing.push(...r.missing);
  return { known: false, missing: uniq(missing), deps: uniq(deps) };
}

function allDeps(results: Result[]): string[] {
  return results.flatMap((r) => r.deps);
}

const EPSILON = 1e-9;

export interface EvaluationContext {
  rules: RulesFile;
  defs: ReadonlyMap<string, FactDef>;
  answers: ReadonlyMap<string, Value>;
}

export class Evaluator {
  private readonly cache = new Map<string, Result>();
  private readonly active = new Set<string>();

  constructor(private readonly ctx: EvaluationContext) {}

  /** Evaluate a concrete fact path, e.g. `/eitc/amount` or `/children/#a/age`. */
  fact(path: string): Result {
    const hit = this.cache.get(path);
    if (hit) return hit;

    const defPath = toDefinitionPath(path);
    const def = this.ctx.defs.get(defPath);
    if (!def) throw new FactfinchError("UNKNOWN_FACT", "No such fact", path);

    // Every item the path goes through must exist.
    for (const { collection, id } of itemsInPath(path)) {
      const coll = this.fact(collection);
      if (!coll.known) return this.store(path, unknown([coll]));
      if (!(coll.value as readonly string[]).includes(id)) {
        throw new FactfinchError("UNKNOWN_ITEM", `No item "${id}" in ${collection}`, path);
      }
    }

    if (def.derive === undefined) {
      const answer = this.ctx.answers.get(path);
      return this.store(
        path,
        answer === undefined ? { known: false, missing: [path], deps: [] } : known(answer),
      );
    }

    if (this.active.has(path)) {
      throw new FactfinchError("CYCLE", "Circular definition", path);
    }
    this.active.add(path);
    try {
      return this.store(path, this.expr(def.derive, itemContextOf(path), path));
    } finally {
      this.active.delete(path);
    }
  }

  private store(path: string, result: Result): Result {
    this.cache.set(path, result);
    return result;
  }

  private fail(at: string, message: string): never {
    throw new FactfinchError("EVALUATION_ERROR", message, at);
  }

  private num(r: KnownResult, op: string, at: string): number {
    if (typeof r.value !== "number")
      this.fail(at, `"${op}" needs numbers, got ${JSON.stringify(r.value)}`);
    return r.value;
  }

  private bool(r: KnownResult, op: string, at: string): boolean {
    if (typeof r.value !== "boolean")
      this.fail(at, `"${op}" needs yes/no values, got ${JSON.stringify(r.value)}`);
    return r.value;
  }

  /** Evaluate, turning evaluation errors into "unknown" (used where a branch may be guarded). */
  private tryExpr(e: Expr, item: string | undefined, at: string): Result | undefined {
    try {
      return this.expr(e, item, at);
    } catch (err) {
      if (err instanceof FactfinchError && err.code === "EVALUATION_ERROR") return undefined;
      throw err;
    }
  }

  expr(e: Expr, item: string | undefined, at: string): Result {
    if (typeof e === "number" || typeof e === "string" || typeof e === "boolean") return known(e);
    const op = Object.keys(e)[0] as string;
    const arg = (e as Record<string, unknown>)[op];

    switch (op) {
      case "fact": {
        const path = resolveRef(arg as string, item);
        if (!path) this.fail(at, `Can't resolve ${String(arg)} here`);
        const r = this.fact(path);
        return r.known ? known(r.value, [path]) : { ...r, deps: [path] };
      }
      case "const": {
        const value = this.ctx.rules.constants?.[arg as string];
        if (value === undefined) this.fail(at, `No constant ${String(arg)}`);
        return known(value);
      }
      case "and":
      case "or":
        return this.logic(op, arg as Expr[], item, at);
      case "not": {
        const r = this.expr(arg as Expr, item, at);
        return r.known ? known(!this.bool(r, "not", at), r.deps) : r;
      }
      case "if": {
        const [c, t, f] = arg as [Expr, Expr, Expr];
        const cond = this.expr(c, item, at);
        if (cond.known) {
          const branch = this.expr(this.bool(cond, "if", at) ? t : f, item, at);
          const deps = [...cond.deps, ...branch.deps];
          return branch.known ? known(branch.value, deps) : { ...branch, deps: uniq(deps) };
        }
        // Condition unknown: if both branches agree, the answer is settled anyway.
        const a = this.tryExpr(t, item, at);
        const b = this.tryExpr(f, item, at);
        if (a?.known && b?.known && a.value === b.value) {
          return known(a.value, [...a.deps, ...b.deps]);
        }
        return unknown([cond], cond.deps);
      }
      case "eq":
      case "neq":
      case "gt":
      case "gte":
      case "lt":
      case "lte": {
        const [l, r] = (arg as Expr[]).map((x) => this.expr(x, item, at)) as [Result, Result];
        if (!l.known || !r.known) return unknown([l, r], allDeps([l, r]));
        const deps = allDeps([l, r]);
        if (op === "eq") return known(l.value === r.value, deps);
        if (op === "neq") return known(l.value !== r.value, deps);
        const a = this.num(l, op, at);
        const b = this.num(r, op, at);
        const out = op === "gt" ? a > b : op === "gte" ? a >= b : op === "lt" ? a < b : a <= b;
        return known(out, deps);
      }
      case "in": {
        const [x, list] = arg as [Expr, Value[]];
        const r = this.expr(x, item, at);
        return r.known ? known(list.includes(r.value), r.deps) : r;
      }
      case "add":
      case "mul":
      case "min":
      case "max": {
        const rs = (arg as Expr[]).map((x) => this.expr(x, item, at));
        const deps = allDeps(rs);
        if (op === "mul") {
          const zero = rs.find((r) => r.known && r.value === 0);
          if (zero) return known(0, zero.deps);
        }
        if (rs.some((r) => !r.known)) return unknown(rs, deps);
        const ns = rs.map((r) => this.num(r as KnownResult, op, at));
        const out =
          op === "add"
            ? ns.reduce((s, n) => s + n, 0)
            : op === "mul"
              ? ns.reduce((s, n) => s * n, 1)
              : op === "min"
                ? Math.min(...ns)
                : Math.max(...ns);
        return known(out, deps);
      }
      case "sub":
      case "div": {
        const [l, r] = (arg as Expr[]).map((x) => this.expr(x, item, at)) as [Result, Result];
        const deps = allDeps([l, r]);
        if (op === "div" && l.known && l.value === 0) return known(0, l.deps);
        if (!l.known || !r.known) return unknown([l, r], deps);
        const a = this.num(l, op, at);
        const b = this.num(r, op, at);
        if (op === "div" && b === 0) this.fail(at, "Division by zero");
        return known(op === "sub" ? a - b : a / b, deps);
      }
      case "round":
      case "floor":
      case "ceil": {
        const r = this.expr(arg as Expr, item, at);
        if (!r.known) return r;
        const n = this.num(r, op, at);
        // Nudge by a tiny epsilon so 0.1 * 3 style float noise doesn't flip results.
        const out =
          op === "round"
            ? Math.sign(n) * Math.round(Math.abs(n) + EPSILON)
            : op === "floor"
              ? Math.floor(n + EPSILON)
              : Math.ceil(n - EPSILON);
        return known(out === 0 ? 0 : out, r.deps);
      }
      case "count":
      case "sum":
        return this.aggregate(op, arg as { in: string; of?: Expr; where?: Expr }, item, at);
      case "lookup": {
        const { table, key, default: dflt } = arg as { table: string; key: Expr; default?: Expr };
        const k = this.expr(key, item, at);
        if (!k.known) return k;
        const value = this.ctx.rules.tables?.[table]?.[String(k.value)];
        if (value !== undefined) return known(value, k.deps);
        if (dflt === undefined) this.fail(at, `Table ${table} has no row for ${String(k.value)}`);
        const d = this.expr(dflt, item, at);
        return d.known ? known(d.value, [...k.deps, ...d.deps]) : d;
      }
      default:
        this.fail(at, `Unknown operator "${op}"`);
    }
  }

  private logic(op: "and" | "or", parts: Expr[], item: string | undefined, at: string): Result {
    // `and` is decided by any false part; `or` by any true part.
    const decider = op === "or";
    const results: Result[] = [];
    let decided = false;
    for (const part of parts) {
      // Once decided, later parts are evaluated only to explain the result;
      // they may be guarded by the deciding part, so errors are ignored.
      const r = decided ? this.tryExpr(part, item, at) : this.expr(part, item, at);
      if (!r) continue;
      if (r.known) this.bool(r, op, at);
      if (r.known && r.value === decider) decided = true;
      results.push(r);
    }
    // A false `and` cites every failing part (all of them need fixing); a true
    // `or` cites the first part that holds (one reason is enough).
    const deciding = results.filter((r) => r.known && r.value === decider);
    if (deciding.length > 0)
      return known(decider, allDeps(op === "or" ? deciding.slice(0, 1) : deciding));
    if (results.every((r) => r.known)) return known(!decider, allDeps(results));
    // Ask about parts left to right: only the first unsettled part's questions
    // are needed next, because answering them may decide the whole thing.
    const first = results.find((r) => !r.known) as UnknownResult;
    return { known: false, missing: first.missing, deps: uniq(allDeps(results)) };
  }

  private aggregate(
    op: "count" | "sum",
    arg: { in: string; of?: Expr; where?: Expr },
    item: string | undefined,
    at: string,
  ): Result {
    const collection = resolveRef(arg.in, item);
    if (!collection) this.fail(at, `Can't resolve ${arg.in} here`);
    const coll = this.fact(collection);
    if (!coll.known) return { ...coll, deps: [collection] };

    const parts: Result[] = [];
    let total = 0;
    let pending = false;
    for (const id of coll.value as readonly string[]) {
      const ctx = itemPath(collection, id);
      let include: Result = known(true);
      if (arg.where !== undefined) {
        include = this.expr(arg.where, ctx, at);
        parts.push(include);
        if (!include.known) {
          pending = true;
          continue;
        }
        if (!this.bool(include, op, at)) continue;
      }
      if (op === "count") {
        total += 1;
        continue;
      }
      const v = this.expr(arg.of as Expr, ctx, at);
      parts.push(v);
      if (!v.known) pending = true;
      else total += this.num(v, "sum", at);
    }
    const deps = [collection, ...allDeps(parts)];
    return pending ? unknown(parts, deps) : known(total, deps);
  }
}
