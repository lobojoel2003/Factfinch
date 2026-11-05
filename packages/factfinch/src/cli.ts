/**
 * The `factfinch` command-line tool. `cli()` takes its input and output as
 * arguments so it can be tested; `bin.ts` wires it to the real terminal.
 */
import { parseAnswer } from "./answers.js";
import { BUILD_INFO } from "./build-info.js";
import { FactfinchError, RulesError } from "./errors.js";
import type { Explanation } from "./explain.js";
import { FactGraph } from "./graph.js";
import type { Session, SessionSnapshot } from "./session.js";
import { runCases, type CasesFile } from "./testing.js";
import { validateRules } from "./validate.js";

export interface CliIO {
  /** Print one line of normal output. */
  out(line: string): void;
  /** Print one line of error output. */
  err(line: string): void;
  /** Read a file as text. */
  readFile(path: string): string;
  /** Show a prompt and read one line; undefined when input has ended. */
  readLine(prompt: string): Promise<string | undefined>;
  /** Use ANSI colors. */
  color: boolean;
}

export const HELP = `factfinch ${BUILD_INFO.version} — plain-language interview engine

Usage:
  factfinch validate <rules.json> [--json]           Check a rules file for problems
  factfinch test <rules.json> <cases.json> [--json]  Run known cases against a rules file
  factfinch ask <rules.json>                         Run the interview in your terminal
  factfinch run <rules.json> <answers.json> [--json] Results and reasons for saved answers
  factfinch --version                                Print version and build number
  factfinch --help                                   Show this help

<answers.json> is a snapshot saved by the demo ("Download my answers"), or a
plain object of answers keyed by path.`;

class UsageError extends Error {}

/** Run the CLI. Resolves to the process exit code. */
export async function cli(argv: string[], io: CliIO): Promise<number> {
  const paint = (code: number) => (s: string) => (io.color ? `\x1b[${code}m${s}\x1b[0m` : s);
  const c = { green: paint(32), red: paint(31), dim: paint(2), bold: paint(1) };

  const json = argv.includes("--json");
  const [command, ...args] = argv.filter((a) => a !== "--json");

  const readJson = (path: string | undefined): unknown => {
    if (!path) throw new UsageError("Missing a file argument.");
    let text: string;
    try {
      text = io.readFile(path);
    } catch (err) {
      throw new Error(`Could not read ${path}: ${(err as Error).message}`);
    }
    try {
      return JSON.parse(text);
    } catch (err) {
      throw new Error(`${path} is not valid JSON: ${(err as Error).message}`);
    }
  };

  const printJson = (value: unknown) => io.out(JSON.stringify(value, null, 2));

  const printExplanation = (e: Explanation, indent: string): void => {
    const line = `• ${e.text ?? `${e.label}: ${e.display}`}`;
    io.out(indent + (e.kind === "input" ? c.dim(line) : line));
    for (const child of e.children) printExplanation(child, indent + "  ");
  };

  const printResults = (session: Session): void => {
    io.out("");
    io.out(c.bold("Results"));
    for (const r of session.results()) {
      io.out("");
      io.out(`${c.bold(r.label)}: ${r.display}`);
      for (const child of r.explanation.children) printExplanation(child, "  ");
    }
    const disclaimer = session.graph.rules.disclaimer;
    if (disclaimer) {
      io.out("");
      io.out(c.dim(disclaimer));
    }
  };

  const commands: Record<string, () => Promise<number> | number> = {
    validate() {
      const issues = validateRules(readJson(args[0]));
      if (json) printJson({ valid: issues.length === 0, issues });
      else if (issues.length === 0) io.out(c.green(`✓ ${args[0]} is valid`));
      else for (const i of issues) io.out(c.red(`✗ ${i.where}: ${i.message}`));
      return issues.length === 0 ? 0 : 1;
    },

    test() {
      const graph = FactGraph.load(readJson(args[0]));
      if (!args[1]) throw new UsageError("Missing the cases file.");
      const results = runCases(graph, readJson(args[1]) as CasesFile);
      const failed = results.filter((r) => !r.passed).length;
      if (json) {
        printJson({ passed: results.length - failed, failed, results });
      } else {
        for (const r of results) {
          const mark = r.passed ? c.green("✓") : c.red("✗");
          io.out(`${mark} ${r.name} ${c.dim(`(${r.asked.length} questions)`)}`);
          for (const f of r.failures) io.out(c.red(`    ${f}`));
        }
        io.out("");
        io.out(`${results.length - failed} passed, ${failed} failed`);
      }
      return failed === 0 ? 0 : 1;
    },

    async ask() {
      const graph = FactGraph.load(readJson(args[0]));
      const session = graph.createSession();
      const read = async (prompt: string): Promise<string> => {
        const line = await io.readLine(prompt);
        if (line === undefined) throw new Error("Input ended before the interview finished.");
        return line;
      };
      io.out(c.bold(graph.rules.title));
      if (graph.rules.description) io.out(c.dim(graph.rules.description));

      for (let q = session.nextQuestion(); q; q = session.nextQuestion()) {
        io.out("");
        io.out(c.bold(q.prompt));
        if (q.help) io.out(c.dim(q.help));

        if (q.type === "collection") {
          const count = Number((await read("How many? ")).trim() || "0");
          if (!Number.isInteger(count) || count < 0 || count > 50) {
            io.out(c.red("Please enter a whole number."));
            continue;
          }
          const names: string[] = [];
          for (let i = 1; i <= count; i++) {
            names.push(
              q.itemName ? (await read(`Name of ${q.itemNoun ?? "item"} ${i}: `)).trim() : "",
            );
          }
          const path = q.path;
          session.batch(() => {
            session.set(path, []);
            for (const name of names) session.addItem(path, name ? { name } : {});
          });
          continue;
        }

        q.options?.forEach((o, i) =>
          io.out(`  ${i + 1}. ${o.label}${o.help ? c.dim(` — ${o.help}`) : ""}`),
        );
        const hint = q.type === "boolean" ? c.dim(`(${q.trueLabel}/${q.falseLabel}) `) : "";
        try {
          session.set(q.path, parseAnswer(q, await read(`> ${hint}`)));
        } catch (err) {
          if (!(err instanceof FactfinchError)) throw err;
          io.out(c.red(err.message.replace(/\s*\(\/[^)]*\)$/, "")));
        }
      }
      printResults(session);
      return 0;
    },

    run() {
      const graph = FactGraph.load(readJson(args[0]));
      const file = readJson(args[1]) as Partial<SessionSnapshot> & Record<string, unknown>;
      const answers = (file.answers ?? file) as SessionSnapshot["answers"];
      const session = graph.createSession({
        factfinch: 1,
        rules: { id: file.rules?.id ?? graph.id, version: graph.version },
        answers,
      });
      const pending = session.pendingQuestions();
      if (json) {
        printJson({
          complete: pending.length === 0,
          pending: pending.map((q) => ({ path: q.path, prompt: q.prompt })),
          results: session.results(),
        });
        return 0;
      }
      if (pending.length > 0) {
        io.out(c.bold("Still needed:"));
        for (const q of pending) io.out(`  ${q.path}  ${c.dim(q.prompt)}`);
      }
      printResults(session);
      return 0;
    },
  };

  try {
    if (command === undefined || command === "help" || command === "-h" || command === "--help") {
      io.out(HELP);
      return 0;
    }
    if (command === "-v" || command === "--version") {
      io.out(`${BUILD_INFO.version}+build.${BUILD_INFO.build} (${BUILD_INFO.commit})`);
      return 0;
    }
    const run = Object.hasOwn(commands, command) ? commands[command] : undefined;
    if (!run) throw new UsageError(`Unknown command "${command}".`);
    return await run();
  } catch (err) {
    if (err instanceof UsageError) {
      io.err(c.red(err.message));
      io.err("");
      io.err(HELP);
      return 2;
    }
    if (err instanceof RulesError) {
      for (const i of err.issues) io.err(c.red(`✗ ${i.where}: ${i.message}`));
    } else {
      io.err(c.red(err instanceof Error ? err.message : String(err)));
    }
    return 1;
  }
}
