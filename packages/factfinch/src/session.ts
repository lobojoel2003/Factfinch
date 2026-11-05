/**
 * A session is one person's interview: their answers, plus everything the
 * engine can work out from them so far.
 */
import { validateAnswer } from "./answers.js";
import { FactfinchError } from "./errors.js";
import { Evaluator } from "./evaluate.js";
import { explanationTemplate, type Explanation, type ExplainOptions } from "./explain.js";
import { formatValue, type FormatName } from "./format.js";
import type { FactGraph } from "./graph.js";
import {
  itemContextOf,
  itemPath,
  itemsInPath,
  resolveRef,
  segments,
  splitItem,
  toDefinitionPath,
} from "./paths.js";
import { renderTemplate } from "./template.js";
import type { EnumOption, FactDef, FactType, Result, Value } from "./types.js";
import { RULES_FORMAT_VERSION } from "./types.js";

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
  /** Collection questions: the "add" button label. */
  addLabel?: string;
  /** Collection questions: what one item is called, e.g. "child". */
  itemNoun?: string;
  /** Collection questions: relative name of the fact that labels each item. */
  itemName?: string;
  /** Set when the question is about one collection item. */
  item?: { collection: string; id: string; label: string; index: number };
  /** The current answer, if any (useful when going back). */
  answer?: Value;
}

/** One result with its value and explanation, ready to show. */
export interface ResultView {
  fact: string;
  label: string;
  description?: string;
  known: boolean;
  value?: Value;
  display: string;
  explanation: Explanation;
}

/** Everything needed to resume a session later. Plain JSON. */
export interface SessionSnapshot {
  factfinch: number;
  rules: { id: string; version: string };
  answers: Record<string, Value>;
}

const NOT_ANSWERED = "(not answered yet)";
const NOT_KNOWN = "(not known yet)";

export class Session {
  private readonly answers = new Map<string, Value>();
  private evaluator: Evaluator | undefined;
  private readonly listeners = new Set<() => void>();
  private rev = 0;
  private batchDepth = 0;
  private pendingNotify = false;

  /** @internal Use `FactGraph.createSession`. */
  constructor(
    readonly graph: FactGraph,
    private readonly defs: ReadonlyMap<string, FactDef>,
  ) {}

  // --- Change tracking ---------------------------------------------------------

  /** Increases on every change. Handy as a React dependency. */
  get revision(): number {
    return this.rev;
  }

  /** Subscribe to changes. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Make several changes as one. Listeners hear about them once, at the end.
   * If `fn` throws, every change it made is undone and the error is rethrown.
   */
  batch<T>(fn: () => T): T {
    const before = new Map(this.answers);
    const notifyBefore = this.pendingNotify;
    this.batchDepth += 1;
    try {
      return fn();
    } catch (err) {
      this.answers.clear();
      for (const [k, v] of before) this.answers.set(k, v);
      this.evaluator = undefined;
      this.pendingNotify = notifyBefore;
      throw err;
    } finally {
      this.batchDepth -= 1;
      if (this.batchDepth === 0 && this.pendingNotify) {
        this.pendingNotify = false;
        this.notify();
      }
    }
  }

  private changed(): void {
    this.evaluator = undefined;
    if (this.batchDepth > 0) this.pendingNotify = true;
    else this.notify();
  }

  private notify(): void {
    this.rev += 1;
    for (const listener of [...this.listeners]) listener();
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

  // --- Reading -----------------------------------------------------------------

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

  /** A fact's value in plain words: "$4,328", "Yes", "Maya, Leo". */
  display(path: string, format?: FormatName): string {
    const def = this.def(path);
    const r = this.get(path);
    if (!r.known) return def.derive === undefined ? NOT_ANSWERED : NOT_KNOWN;
    if (def.type === "collection" && format === undefined) {
      const ids = r.value as readonly string[];
      return ids.length === 0 ? "None" : ids.map((id) => this.itemLabel(path, id)).join(", ");
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
    const noun = def.question?.itemNoun?.trim() || "item";
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
        return formatValue(value, undefined, (format as FormatName | undefined) ?? "number");
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

  // --- Writing -----------------------------------------------------------------

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
    if (def.type === "collection") {
      for (const id of this.items(path)) this.dropItemAnswers(path, id);
    }
    if (this.answers.delete(path)) this.changed();
  }

  /** Remove every answer. */
  clear(): void {
    if (this.answers.size === 0) return;
    this.answers.clear();
    this.changed();
  }

  /** Add an item to a collection, optionally with its name. Returns the item's id. */
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
    const newId = id;
    this.batch(() => {
      this.set(collection, [...ids, newId]);
      if (opts.name !== undefined && def.itemName) {
        this.set(`${itemPath(collection, newId)}/${def.itemName}`, opts.name);
      }
    });
    return newId;
  }

  /** Remove an item and all of its answers. */
  removeItem(collection: string, id: string): void {
    this.set(
      collection,
      this.items(collection).filter((x) => x !== id),
    );
  }

  private dropItemAnswers(collection: string, id: string): void {
    const prefix = `${itemPath(collection, id)}/`;
    for (const key of [...this.answers.keys()]) {
      if (key.startsWith(prefix)) this.answers.delete(key);
    }
  }

  // --- The interview -------------------------------------------------------------

  /** Describe the question for an input path (answered or not). */
  question(path: string): Question {
    const def = this.def(path);
    if (!def.question) {
      throw new FactfinchError("NOT_AN_INPUT", "This fact is worked out, not asked", path);
    }
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
   * Every unanswered question that could settle a result right now, in asking
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
      for (const dep of this.get(path).deps) visit(dep);
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

  // --- Explanations ----------------------------------------------------------------

  /**
   * Explain a fact in plain language, with the reasons that decided it. Each
   * fact appears once per tree, where it first matters.
   */
  explain(path: string, options: ExplainOptions = {}): Explanation {
    const maxDepth = options.maxDepth ?? 8;
    const includeInputs = options.includeInputs ?? true;
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
    const template = r.known ? explanationTemplate(def, r.value) : undefined;
    const text = template ? this.render(template, ctx) : undefined;
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

    if (!r.known || kind === "input" || depth >= maxDepth) return node;

    const collect = (deps: string[]): void => {
      for (const dep of deps) {
        if (seen.has(dep)) continue;
        seen.add(dep);
        const d = this.def(dep);
        if (d.derive === undefined) {
          if (includeInputs) {
            node.children.push(this.explainNode(dep, depth + 1, maxDepth, includeInputs, seen));
          }
          continue;
        }
        const res = this.get(dep);
        const tpl = res.known ? explanationTemplate(d, res.value) : undefined;
        // "" means "this doesn't matter here": hide the fact and its reasons.
        if (tpl === "") continue;
        if (tpl)
          node.children.push(this.explainNode(dep, depth + 1, maxDepth, includeInputs, seen));
        // No wording of its own: show its reasons in its place.
        else collect(res.deps);
      }
    };
    collect(r.deps);
    return node;
  }

  // --- Ordering ----------------------------------------------------------------------

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

  // --- Persistence ---------------------------------------------------------------------

  /** A plain-JSON snapshot of the answers. Pass it to `FactGraph.createSession` to resume. */
  toJSON(): SessionSnapshot {
    return {
      factfinch: RULES_FORMAT_VERSION,
      rules: { id: this.graph.id, version: this.graph.version },
      answers: this.allAnswers(),
    };
  }

  /**
   * Add the answers from a snapshot to this session. All or nothing: if any
   * answer is invalid, nothing changes and the error is thrown. Call `clear()`
   * first (inside `batch`) to replace the answers instead.
   */
  restore(snapshot: SessionSnapshot): void {
    if (
      !snapshot ||
      typeof snapshot !== "object" ||
      !snapshot.answers ||
      typeof snapshot.answers !== "object"
    ) {
      throw new FactfinchError("INVALID_SNAPSHOT", "Snapshot must have an answers object");
    }
    if (snapshot.factfinch !== undefined && snapshot.factfinch !== RULES_FORMAT_VERSION) {
      throw new FactfinchError(
        "INVALID_SNAPSHOT",
        `Snapshot format ${String(snapshot.factfinch)} is not supported`,
      );
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
    this.batch(() => {
      for (const [path, value] of entries) this.set(path, value);
    });
  }
}
