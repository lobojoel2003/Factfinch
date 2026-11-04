import { FactfinchError, RulesError } from "./errors.js";
import { Evaluator } from "./evaluate.js";
import { formatValue, type FormatName } from "./format.js";
import {
  isValidItemId,
  itemContextOf,
  itemPath,
  itemsInPath,
  resolveRef,
  segments,
  splitItem,
  toDefinitionPath,
} from "./paths.js";
import { renderTemplate } from "./template.js";
import type { EnumOption, FactDef, FactType, Result, RulesFile, Value } from "./types.js";
import { RULES_FORMAT_VERSION } from "./types.js";
import { validateRules } from "./validate.js";

// ---------------------------------------------------------------------------
// Public shapes
// ---------------------------------------------------------------------------

/** A question ready to show to a person. All text is already filled in. */
export interface Question {
  /** Concrete path to answer, e.g. `/children/#c1/age`. */
  path: string;
  /** Definition path, e.g. `/children/*\/age`. */
  definitionPath: string;
  type: FactType;
  prompt: string;
  help?: string;
  section?: string;
  options?: EnumOption[];
  min?: number;
  max?: number;
  maxLength?: number;
  placeholder?: string;
  trueLabel: string;
  falseLabel: string;
  /** Collection questions: button label and item noun. */
  addLabel?: string;
  itemNoun?: string;
  /** Collection questions: relative name of the fact that labels each item. */
  itemName?: string;
  /** Set when the question is about one collection item. */
  item?: { collection: string; id: string; label: string; index: number };
  /** The current answer, if any (useful when going back). */
  answer?: Value;
}

/** A plain-language explanation tree for one fact. */
export interface Explanation {
  path: string;
  kind: "input" | "derived";
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

export interface ResultView {
  fact: string;
  label: string;
  description?: string;
  known: boolean;
  value?: Value;
  display: string;
  explanation: Explanation;
}

export interface SessionSnapshot {
  factfinch: number;
  rules: { id: string; version: string };
  answers: Record<string, Value>;
}

export interface ExplainOptions {
  /** How many levels of reasons to include. Default 8. */
  maxDepth?: number;
  /** Include answered questions as leaves. Default true. */
  includeInputs?: boolean;
}

// ---------------------------------------------------------------------------
// FactGraph: a loaded, validated rules file
// ---------------------------------------------------------------------------

export class FactGraph {
  readonly rules: RulesFile;
  private readonly defs: Map<string, FactDef>;
  private readonly order: Map<string, number>;

  private constructor(rules: RulesFile) {
    this.rules = rules;
    this.defs = new Map(Object.entries(rules.facts));
    this.order = new Map([...this.defs.keys()].map((k, i) => [k, i]));
  }

  /** Validate and load a rules file (parsed JSON). Throws `RulesError` on problems. */
  static load(rules: unknown): FactGraph {
    const issues = validateRules(rules);
    if (issues.length > 0) throw new RulesError(issues);
    return new FactGraph(rules as RulesFile);
  }

  /** Check a rules file and return its problems without throwing. */
  static validate = validateRules;

  get id(): string {
    return this.rules.id;
  }

  get version(): string {
    return this.rules.version;
  }

  /** Look up a definition by definition or concrete path. */
  definition(path: string): FactDef | undefined {
    return this.defs.get(toDefinitionPath(path));
  }

  /** Definition paths of every fact, in file order. */
  paths(): string[] {
    return [...this.defs.keys()];
  }

  isInput(path: string): boolean {
    const def = this.definition(path);
    return def !== undefined && def.derive === undefined;
  }

  createSession(snapshot?: SessionSnapshot): Session {
    const session = new Session(this, this.defs);
    if (snapshot) session.restore(snapshot);
    return session;
  }

  /** @internal order of a definition path in the rules file */
  orderOf(defPath: string): number {
    return this.order.get(defPath) ?? Number.MAX_SAFE_INTEGER;
  }
}

// ---------------------------------------------------------------------------
// Session: one person's answers, plus everything worked out from them
// ---------------------------------------------------------------------------

export class Session {
  private readonly answers = new Map<string, Value>();
  private evaluator: Evaluator | undefined;
  private readonly listeners = new Set<() => void>();
  private rev = 0;

  /** @internal use FactGraph.createSession */
  constructor(
    readonly graph: FactGraph,
    private readonly defs: Map<string, FactDef>,
  ) {}

  /** Increases on every change. Handy as a React dependency. */
  get revision(): number {
    return this.rev;
  }

  /** Subscribe to changes. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private changed(): void {
    this.evaluator = undefined;
    this.rev += 1;
    for (const l of this.listeners) l();
  }

  private eval(): Evaluator {
    this.evaluator ??= new Evaluator({
      rules: this.graph.rules,
      defs: this.defs,
      answers: this.answers,
    });
    return this.evaluator;
  }

  private def(path: string): FactDef {
    const def = this.defs.get(toDefinitionPath(path));
    if (!def) throw new FactfinchError("UNKNOWN_FACT", "No such fact", path);
    return def;
  }

  // --- Reading ---------------------------------------------------------------

  /** Evaluate any fact. Never throws for missing answers: it returns `known: false`. */
  get(path: string): Result {
    return this.eval().fact(path);
  }

  /** The fact's value, or undefined while it can't be worked out yet. */
  value(path: string): Value | undefined {
    const r = this.get(path);
    return r.known ? r.value : undefined;
  }

  /** The raw answer stored for an input fact. */
  answer(path: string): Value | undefined {
    return this.answers.get(path);
  }

  /** All stored answers, in the order they were given. */
  allAnswers(): Record<string, Value> {
    return Object.fromEntries(this.answers);
  }

  /** Item ids of a collection (empty while unanswered). */
  items(collection: string): string[] {
    const v = this.answers.get(collection);
    return Array.isArray(v) ? [...v] : [];
  }

  /** A fact's value in plain words. */
  display(path: string, format?: FormatName): string {
    const def = this.def(path);
    const r = this.get(path);
    if (!r.known) return "(not answered yet)";
    if (def.type === "collection" && format === undefined) {
      const ids = r.value as readonly string[];
      if (ids.length === 0) return "None";
      return ids.map((id) => this.itemLabel(path, id)).join(", ");
    }
    return formatValue(r.value, def, format);
  }

  /** The display name of a collection item ("Sam", or "Child 2" before it has a name). */
  itemLabel(collection: string, id: string): string {
    const def = this.def(collection);
    if (def.itemName) {
      const name = this.answers.get(`${itemPath(collection, id)}/${def.itemName}`);
      if (typeof name === "string" && name.trim()) return name.trim();
    }
    const noun = def.question?.itemNoun ?? "item";
    const index = this.items(collection).indexOf(id);
    return `${noun[0]!.toUpperCase()}${noun.slice(1)} ${index + 1}`;
  }

  /** Fill in a `{{template}}` against this session. `itemContext` is e.g. `/children/#c1`. */
  render(text: string, itemContext?: string): string {
    return renderTemplate(text, (ref, format) => {
      if (ref === "item") {
        if (!itemContext) return "";
        const { collection, id } = splitItem(itemContext);
        return this.itemLabel(collection, id);
      }
      if (ref.startsWith("const:")) {
        const value = this.graph.rules.constants?.[ref.slice(6)];
        if (value === undefined) return "";
        return formatValue(value, undefined, (format as FormatName) ?? "number");
      }
      const path = resolveRef(ref, itemContext);
      if (!path) return "";
      try {
        return this.display(path, format as FormatName | undefined);
      } catch {
        return "(unknown)";
      }
    });
  }

  // --- Writing ---------------------------------------------------------------

  /** Answer an input fact. Throws `FactfinchError` (code INVALID_ANSWER) on bad values. */
  set(path: string, value: Value): void {
    const def = this.def(path);
    if (def.derive !== undefined) {
      throw new FactfinchError("NOT_AN_INPUT", "This fact is worked out, not asked", path);
    }
    for (const { collection, id } of itemsInPath(path)) {
      if (!this.items(collection).includes(id)) {
        throw new FactfinchError("UNKNOWN_ITEM", `No item "${id}" in ${collection}`, path);
      }
    }
    const clean = validateAnswer(def, value, path);
    if (def.type === "collection") {
      const keep = new Set(clean as string[]);
      for (const old of this.items(path)) if (!keep.has(old)) this.dropItemAnswers(path, old);
    }
    this.answers.set(path, clean);
    this.changed();
  }

  /** Remove an answer (and, for collections, every item answer under it). */
  unset(path: string): void {
    const def = this.def(path);
    if (def.type === "collection")
      for (const id of this.items(path)) this.dropItemAnswers(path, id);
    if (this.answers.delete(path)) this.changed();
  }

  /** Add an item to a collection. Returns the new item's id. */
  addItem(collection: string, opts: { id?: string; name?: string } = {}): string {
    const def = this.def(collection);
    if (def.type !== "collection") {
      throw new FactfinchError("INVALID_ANSWER", "Not a collection", collection);
    }
    const ids = this.items(collection);
    let id = opts.id;
    if (id === undefined) {
      let n = ids.length + 1;
      while (ids.includes(`item${n}`)) n++;
      id = `item${n}`;
    }
    this.set(collection, [...ids, id]);
    if (opts.name !== undefined && def.itemName) {
      this.set(`${itemPath(collection, id)}/${def.itemName}`, opts.name);
    }
    return id;
  }

  removeItem(collection: string, id: string): void {
    this.set(
      collection,
      this.items(collection).filter((x) => x !== id),
    );
  }

  private dropItemAnswers(collection: string, id: string): void {
    const prefix = `${itemPath(collection, id)}/`;
    for (const key of [...this.answers.keys()])
      if (key.startsWith(prefix)) this.answers.delete(key);
  }

  // --- The interview -----------------------------------------------------------

  /** Describe the question for an input path (answered or not). */
  question(path: string): Question {
    const def = this.def(path);
    if (!def.question)
      throw new FactfinchError("NOT_AN_INPUT", "This fact is worked out, not asked", path);
    const q = def.question;
    const ctx = itemContextOf(path);
    const out: Question = {
      path,
      definitionPath: toDefinitionPath(path),
      type: def.type,
      prompt: this.render(q.prompt, ctx),
      trueLabel: q.trueLabel ?? "Yes",
      falseLabel: q.falseLabel ?? "No",
    };
    if (q.help) out.help = this.render(q.help, ctx);
    if (q.section) out.section = q.section;
    if (def.options) out.options = def.options;
    if (def.min !== undefined) out.min = def.min;
    if (def.max !== undefined) out.max = def.max;
    if (def.maxLength !== undefined) out.maxLength = def.maxLength;
    if (q.placeholder) out.placeholder = q.placeholder;
    if (q.addLabel) out.addLabel = q.addLabel;
    if (q.itemNoun) out.itemNoun = q.itemNoun;
    if (def.itemName) out.itemName = def.itemName;
    if (ctx) {
      const { collection, id } = splitItem(ctx);
      out.item = {
        collection,
        id,
        label: this.itemLabel(collection, id),
        index: this.items(collection).indexOf(id),
      };
    }
    const answer = this.answers.get(path);
    if (answer !== undefined) out.answer = answer;
    return out;
  }

  /**
   * Every unanswered question that could still change a result, in asking
   * order. Questions that can no longer matter are never included.
   */
  pendingQuestions(): Question[] {
    const missing = new Set<string>();
    for (const r of this.graph.rules.results) {
      const res = this.get(r.fact);
      if (!res.known) for (const m of res.missing) missing.add(m);
    }
    return [...missing].sort((a, b) => this.compareOrder(a, b)).map((p) => this.question(p));
  }

  /** The single next question to ask, or undefined when every result is known. */
  nextQuestion(): Question | undefined {
    return this.pendingQuestions()[0];
  }

  /** True once every result in the rules file is known. */
  isComplete(): boolean {
    return this.graph.rules.results.every((r) => this.get(r.fact).known);
  }

  /** Answered questions in asking order (for a "review your answers" page). */
  answeredQuestions(): Question[] {
    return [...this.answers.keys()]
      .sort((a, b) => this.compareOrder(a, b))
      .map((p) => this.question(p));
  }

  /**
   * Answered questions that currently feed into a result, in asking order.
   * Answers made irrelevant by later changes (say, a spouse's age after
   * switching to "single") are left out.
   */
  relevantAnswers(): Question[] {
    const used = new Set<string>();
    const visit = (path: string): void => {
      if (used.has(path)) return;
      used.add(path);
      const r = this.get(path);
      for (const dep of r.deps) visit(dep);
      // Every item a path lives in depends on its collection.
      for (const { collection } of itemsInPath(path)) visit(collection);
    };
    for (const r of this.graph.rules.results) visit(r.fact);
    return this.answeredQuestions().filter((q) => used.has(q.path));
  }

  /** Every result with its value and explanation. */
  results(options?: ExplainOptions): ResultView[] {
    return this.graph.rules.results.map((r) => {
      const res = this.get(r.fact);
      const view: ResultView = {
        fact: r.fact,
        label: r.label,
        known: res.known,
        display: this.display(r.fact),
        explanation: this.explain(r.fact, options),
      };
      if (r.description) view.description = r.description;
      if (res.known) view.value = res.value;
      return view;
    });
  }

  /** Explain a fact in plain language, with the reasons that decided it. */
  explain(path: string, options: ExplainOptions = {}): Explanation {
    const maxDepth = options.maxDepth ?? 8;
    const includeInputs = options.includeInputs ?? true;
    // Each fact appears once per tree, where it first matters.
    return this.explainNode(path, 0, maxDepth, includeInputs, new Set([path]));
  }

  private explainNode(
    path: string,
    depth: number,
    maxDepth: number,
    includeInputs: boolean,
    seen: Set<string>,
  ): Explanation {
    const def = this.def(path);
    const r = this.get(path);
    const ctx = itemContextOf(path);
    const kind = def.derive === undefined ? "input" : "derived";
    const tpl = r.known ? explainTemplate(def, r.value) : undefined;
    const text = tpl ? this.render(tpl, ctx) : undefined;
    const label = def.label
      ? this.render(def.label, ctx)
      : def.question
        ? this.render(def.question.prompt, ctx)
        : (text ?? path);
    const node: Explanation = {
      path,
      kind,
      label,
      known: r.known,
      display: this.display(path),
      children: [],
    };
    if (r.known) node.value = r.value;
    else node.missing = r.missing;

    if (text) node.text = text;

    if (r.known && kind === "derived" && depth < maxDepth) {
      const collect = (deps: string[]): void => {
        for (const dep of deps) {
          if (seen.has(dep)) continue;
          seen.add(dep);
          const d = this.def(dep);
          const isInput = d.derive === undefined;
          // An explanation of "" means "this doesn't matter here": hide it and its reasons.
          if (!isInput && this.isSilenced(dep)) continue;
          const worded = !isInput && this.hasWording(dep);
          if (isInput ? includeInputs : worded) {
            node.children.push(this.explainNode(dep, depth + 1, maxDepth, includeInputs, seen));
          } else if (!isInput) {
            // Intermediate fact with no wording of its own: look through it.
            collect(this.get(dep).deps);
          }
        }
      };
      collect(r.deps);
    }
    return node;
  }

  private isSilenced(path: string): boolean {
    const r = this.get(path);
    return r.known && rawExplainTemplate(this.def(path), r.value) === "";
  }

  private hasWording(path: string): boolean {
    const r = this.get(path);
    return r.known && explainTemplate(this.def(path), r.value) !== undefined;
  }

  // --- Ordering --------------------------------------------------------------

  /** Sort key: file order, but every question about one item stays together. */
  private orderKey(path: string): number[] {
    const key: number[] = [];
    for (const { collection, id } of itemsInPath(path)) {
      key.push(
        this.graph.orderOf(toDefinitionPath(collection)),
        this.items(collection).indexOf(id),
      );
    }
    key.push(this.graph.orderOf(toDefinitionPath(path)));
    return key;
  }

  private compareOrder(a: string, b: string): number {
    const ka = this.orderKey(a);
    const kb = this.orderKey(b);
    for (let i = 0; i < Math.min(ka.length, kb.length); i++) {
      if (ka[i] !== kb[i]) return ka[i]! - kb[i]!;
    }
    return ka.length - kb.length;
  }

  // --- Persistence -------------------------------------------------------------

  toJSON(): SessionSnapshot {
    return {
      factfinch: RULES_FORMAT_VERSION,
      rules: { id: this.graph.id, version: this.graph.version },
      answers: this.allAnswers(),
    };
  }

  /** @internal use FactGraph.createSession(snapshot) */
  restore(snapshot: SessionSnapshot): void {
    if (!snapshot || typeof snapshot !== "object" || typeof snapshot.answers !== "object") {
      throw new FactfinchError("INVALID_SNAPSHOT", "Snapshot must have an answers object");
    }
    if (snapshot.rules?.id && snapshot.rules.id !== this.graph.id) {
      throw new FactfinchError(
        "INVALID_SNAPSHOT",
        `Snapshot is for rules "${snapshot.rules.id}", not "${this.graph.id}"`,
      );
    }
    // Collections first (shorter paths), so their items exist before item answers.
    const entries = Object.entries(snapshot.answers).sort(
      (a, b) => segments(a[0]).length - segments(b[0]).length,
    );
    for (const [path, value] of entries) this.set(path, value);
  }
}

// ---------------------------------------------------------------------------
// Answer validation
// ---------------------------------------------------------------------------

/** Pick the explanation template for a value. Empty strings mean "say nothing". */
function explainTemplate(def: FactDef, value: Value): string | undefined {
  return rawExplainTemplate(def, value) || undefined;
}

function rawExplainTemplate(def: FactDef, value: Value): string | undefined {
  const e = def.explain;
  if (!e) return undefined;
  const tpl =
    typeof value === "boolean"
      ? ((value ? e.true : e.false) ?? e.known)
      : value === 0
        ? (e.zero ?? e.known)
        : e.known;
  return tpl;
}

function invalid(path: string, message: string): never {
  throw new FactfinchError("INVALID_ANSWER", message, path);
}

export function validateAnswer(def: FactDef, value: unknown, path: string): Value {
  switch (def.type) {
    case "boolean":
      if (typeof value !== "boolean") invalid(path, "Expected yes or no");
      return value;
    case "integer":
    case "number":
    case "dollar": {
      if (typeof value !== "number" || !Number.isFinite(value)) invalid(path, "Expected a number");
      if (def.type === "integer" && !Number.isInteger(value))
        invalid(path, "Expected a whole number");
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
      if (bad !== undefined)
        invalid(path, `Invalid item id "${bad}" (use letters, digits, _ or -)`);
      if (def.maxItems !== undefined && ids.length > def.maxItems) {
        invalid(path, `At most ${def.maxItems} items`);
      }
      return [...ids];
    }
  }
}

/**
 * Turn typed text into an answer value for a question: "yes" -> true,
 * "$1,250.50" -> 1250.5, "2" -> the 2nd enum option or its value. Throws
 * INVALID_ANSWER when the text doesn't fit.
 */
export function parseAnswer(
  question: Pick<Question, "type" | "options" | "path">,
  text: string,
): Value {
  const t = text.trim();
  switch (question.type) {
    case "boolean": {
      if (/^(y|yes|true|1)$/i.test(t)) return true;
      if (/^(n|no|false|0)$/i.test(t)) return false;
      return invalid(question.path, "Please answer yes or no");
    }
    case "integer":
    case "number":
    case "dollar": {
      const cleaned = t.replace(/[$,\s]/g, "");
      if (!/^-?\d*\.?\d+$/.test(cleaned)) return invalid(question.path, "Please enter a number");
      return Number(cleaned);
    }
    case "enum": {
      const opts = question.options ?? [];
      const byIndex = /^\d+$/.test(t) ? opts[Number(t) - 1] : undefined;
      const match =
        byIndex ??
        opts.find(
          (o) =>
            o.value.toLowerCase() === t.toLowerCase() || o.label.toLowerCase() === t.toLowerCase(),
        );
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
