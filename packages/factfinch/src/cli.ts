import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { BUILD_INFO } from "./build-info.js";
import { FactfinchError, RulesError } from "./errors.js";
import { FactGraph, parseAnswer, type Explanation, type Question, type Session } from "./graph.js";
import { runCases, type CasesFile } from "./testing.js";
import { validateRules } from "./validate.js";

const HELP = `factfinch ${BUILD_INFO.version} (build ${BUILD_INFO.build})

Usage:
  factfinch validate <rules.json>               Check a rules file for problems
  factfinch test <rules.json> <cases.json>      Run known cases against a rules file
  factfinch ask <rules.json>                    Run the interview in your terminal
  factfinch run <rules.json> <answers.json>     Print results and explanations for saved answers
  factfinch --version                           Print version and build number
`;

const color = stdout.isTTY && !process.env.NO_COLOR;
const green = (s: string) => (color ? `\x1b[32m${s}\x1b[0m` : s);
const red = (s: string) => (color ? `\x1b[31m${s}\x1b[0m` : s);
const dim = (s: string) => (color ? `\x1b[2m${s}\x1b[0m` : s);
const bold = (s: string) => (color ? `\x1b[1m${s}\x1b[0m` : s);

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new Error(`Could not read ${path}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function printExplanation(e: Explanation, indent = ""): void {
  const line = e.text ?? `${e.label}: ${e.display}`;
  console.log(`${indent}${e.kind === "input" ? dim("• " + line) : "• " + line}`);
  for (const c of e.children) printExplanation(c, indent + "  ");
}

function printResults(session: Session): void {
  console.log("\n" + bold("Results"));
  for (const r of session.results()) {
    console.log(`\n${bold(r.label)}: ${r.display}`);
    for (const c of r.explanation.children) printExplanation(c, "  ");
  }
  if (session.graph.rules.disclaimer) console.log("\n" + dim(session.graph.rules.disclaimer));
}

async function ask(rulesPath: string): Promise<void> {
  const graph = FactGraph.load(readJson(rulesPath));
  const session = graph.createSession();
  const rl = createInterface({ input: stdin, output: stdout, terminal: stdin.isTTY });
  const lines = rl[Symbol.asyncIterator]();
  const prompt = async (text: string): Promise<string> => {
    stdout.write(text);
    const next = await lines.next();
    if (next.done) throw new Error("Input ended before the interview finished.");
    if (!stdin.isTTY) stdout.write(next.value + "\n");
    return next.value;
  };
  console.log(bold(graph.rules.title));
  if (graph.rules.description) console.log(dim(graph.rules.description));
  try {
    let q: Question | undefined;
    while ((q = session.nextQuestion())) {
      console.log("\n" + bold(q.prompt));
      if (q.help) console.log(dim(q.help));
      if (q.type === "collection") {
        const n = Number((await prompt("How many? ")).trim() || "0");
        if (!Number.isInteger(n) || n < 0) {
          console.log(red("Please enter a whole number."));
          continue;
        }
        session.set(q.path, []);
        for (let i = 1; i <= n; i++) {
          const name = q.itemName
            ? (await prompt(`Name of ${q.itemNoun ?? "item"} ${i}: `)).trim()
            : undefined;
          session.addItem(q.path, name ? { name } : {});
        }
        continue;
      }
      q.options?.forEach((o, i) =>
        console.log(`  ${i + 1}. ${o.label}${o.help ? dim(" — " + o.help) : ""}`),
      );
      const hint = q.type === "boolean" ? ` (${q.trueLabel}/${q.falseLabel})` : "";
      const text = await prompt(`> ${hint ? dim(hint) + " " : ""}`);
      try {
        session.set(q.path, parseAnswer(q, text));
      } catch (err) {
        console.log(red(err instanceof FactfinchError ? err.message : String(err)));
      }
    }
  } finally {
    rl.close();
  }
  printResults(session);
}

async function main(argv: string[]): Promise<number> {
  const [cmd, ...args] = argv;
  switch (cmd) {
    case undefined:
    case "-h":
    case "--help":
    case "help":
      console.log(HELP);
      return 0;
    case "-v":
    case "--version":
      console.log(`${BUILD_INFO.version}+build.${BUILD_INFO.build} (${BUILD_INFO.commit})`);
      return 0;
    case "validate": {
      if (!args[0]) break;
      const issues = validateRules(readJson(args[0]));
      if (issues.length === 0) {
        console.log(green(`✓ ${args[0]} is valid`));
        return 0;
      }
      for (const i of issues) console.log(red(`✗ ${i.where}: ${i.message}`));
      return 1;
    }
    case "test": {
      if (!args[0] || !args[1]) break;
      const graph = FactGraph.load(readJson(args[0]));
      const results = runCases(graph, readJson(args[1]) as CasesFile);
      for (const r of results) {
        console.log(
          `${r.passed ? green("✓") : red("✗")} ${r.name} ${dim(`(${r.asked.length} questions)`)}`,
        );
        for (const f of r.failures) console.log(red(`    ${f}`));
      }
      const failed = results.filter((r) => !r.passed).length;
      console.log(`\n${results.length - failed} passed, ${failed} failed`);
      return failed === 0 ? 0 : 1;
    }
    case "ask":
      if (!args[0]) break;
      await ask(args[0]);
      return 0;
    case "run": {
      if (!args[0] || !args[1]) break;
      const graph = FactGraph.load(readJson(args[0]));
      const answers = readJson(args[1]) as Record<string, never>;
      const session = graph.createSession({
        factfinch: 1,
        rules: { id: graph.id, version: graph.version },
        answers: "answers" in answers ? answers.answers : answers,
      });
      const pending = session.pendingQuestions();
      if (pending.length) {
        console.log(bold("Still needed:"));
        for (const q of pending) console.log(`  ${q.path}  ${dim(q.prompt)}`);
      }
      printResults(session);
      return 0;
    }
  }
  console.error(HELP);
  return 2;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: unknown) => {
    if (err instanceof RulesError)
      for (const i of err.issues) console.error(red(`✗ ${i.where}: ${i.message}`));
    else console.error(red(err instanceof Error ? err.message : String(err)));
    process.exit(1);
  },
);
