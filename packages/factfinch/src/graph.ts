/**
 * A FactGraph is a loaded, validated rules file. It is immutable and can be
 * shared: each person's interview is a separate `Session`.
 */
import { RulesError } from "./errors.js";
import { toDefinitionPath } from "./paths.js";
import { Session, type SessionSnapshot } from "./session.js";
import type { FactDef, RulesFile } from "./types.js";
import { validateRules } from "./validate.js";

export class FactGraph {
  readonly rules: RulesFile;
  private readonly defs: ReadonlyMap<string, FactDef>;
  private readonly order: ReadonlyMap<string, number>;

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

  /** Look up a definition by definition path (`/children/*\/age`) or concrete path. */
  definition(path: string): FactDef | undefined {
    return this.defs.get(toDefinitionPath(path));
  }

  /** Definition paths of every fact, in file order. */
  paths(): string[] {
    return [...this.defs.keys()];
  }

  /** True for facts that are asked (they have a question), false for derived ones. */
  isInput(path: string): boolean {
    const def = this.definition(path);
    return def !== undefined && def.derive === undefined;
  }

  /** The question sections ("About you", "Income", ...) in the order they first appear. */
  sections(): string[] {
    const out: string[] = [];
    for (const def of this.defs.values()) {
      const s = def.question?.section;
      if (s && !out.includes(s)) out.push(s);
    }
    return out;
  }

  /** Start an interview, or resume one from a snapshot. */
  createSession(snapshot?: SessionSnapshot): Session {
    const session = new Session(this, this.defs);
    if (snapshot) session.restore(snapshot);
    return session;
  }

  /** @internal Position of a definition path in the rules file. */
  orderOf(defPath: string): number {
    return this.order.get(defPath) ?? Number.MAX_SAFE_INTEGER;
  }
}
