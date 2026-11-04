# Factfinch

**A plain-language interview engine: describe rules as data, ask only the questions still needed, and explain every result in plain words.**

[![CI](https://github.com/lobojoel2003/Factfinch/actions/workflows/ci.yml/badge.svg)](https://github.com/lobojoel2003/Factfinch/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/lobojoel2003/Factfinch?sort=semver)](https://github.com/lobojoel2003/Factfinch/releases)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

**[Try the demo →](https://lobojoel2003.github.io/Factfinch/)** an EITC and Child Tax Credit eligibility checker for tax year 2025.

---

## Why

Tax credit and benefit rules are written for lawyers, so people who qualify for money miss out. IRS Direct File showed a better way: turn the tax code into plain-language questions, and let a _Fact Graph_ work out what follows from the answers — even from a half-finished interview. Direct File is gone for 2026 and its [repository](https://github.com/IRS-Public/direct-file) is archived. Its README describes the Fact Graph as "not domain-specific" and useful "as a reference for business rules engine implementations."

Factfinch takes that idea out of a dead repo and makes it a small, maintained, general-purpose library:

- **Rules are data.** A rules file is JSON: questions, derived facts, and the plain words that explain them. No code to write, easy to review, easy to diff.
- **Ask only what's still needed.** The engine reasons about incomplete answers. Anything that can no longer change a result is never asked. One "yes, someone can claim me as a dependent" ends the EITC/CTC interview at question one.
- **Explain every result.** Each result comes with a tree of reasons that decided it — "Maya is your daughter, which is a qualifying relationship" — down to the answers you gave.
- **Tested with known cases.** Rules ship with a cases file. Each case runs as a real interview, so a test proves both the numbers _and_ that no unneeded question was asked.

It is a fresh TypeScript implementation of the idea, not a port of the Scala code. There are no runtime dependencies.

## What's in this repository

| Path                                                                                                           | What it is                                                    |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| [`packages/factfinch`](packages/factfinch)                                                                     | The library and the `factfinch` CLI (npm package `factfinch`) |
| [`packages/factfinch/rules/us-eitc-ctc-2025.json`](packages/factfinch/rules/us-eitc-ctc-2025.json)             | EITC, Child Tax Credit and credit for other dependents, 2025  |
| [`packages/factfinch/rules/us-eitc-ctc-2025.cases.json`](packages/factfinch/rules/us-eitc-ctc-2025.cases.json) | 34 known cases for those rules                                |
| [`packages/factfinch/schema`](packages/factfinch/schema)                                                       | JSON Schemas for rules and cases files (editor autocomplete)  |
| [`apps/demo`](apps/demo)                                                                                       | The React demo deployed to GitHub Pages                       |
| [`docs/rules-format.md`](docs/rules-format.md)                                                                 | How to write a rules file                                     |
| [`docs/releasing.md`](docs/releasing.md)                                                                       | Versioning, build numbers and the release process             |

## Quick start

```bash
npm install factfinch
```

Until the package is published to npm, install it from a [GitHub release](https://github.com/lobojoel2003/Factfinch/releases) tarball:

```bash
npm install https://github.com/lobojoel2003/Factfinch/releases/download/v0.1.0/factfinch-0.1.0.tgz
```

### Run an interview

```ts
import { FactGraph } from "factfinch";
import rules from "factfinch/rules/us-eitc-ctc-2025.json" with { type: "json" };

const graph = FactGraph.load(rules); // validates the rules; throws RulesError on problems
const session = graph.createSession();

let question;
while ((question = session.nextQuestion())) {
  // question.prompt, question.help, question.type, question.options ...
  session.set(question.path, await askThePerson(question));
}

for (const result of session.results()) {
  console.log(result.label, result.display); // "Earned Income Tax Credit $3,261"
  console.log(result.explanation); // tree of plain-language reasons
}
```

### Try it in your terminal

```bash
npx factfinch ask node_modules/factfinch/rules/us-eitc-ctc-2025.json
```

```text
Earned Income Tax Credit: $4,220
  • You meet the rules for the Earned Income Tax Credit.
    • Children who count toward your EITC: 1.
      • Leo counts toward your Earned Income Tax Credit.
        • Leo is your qualifying child.
          • Leo is your son or daughter, which is a qualifying relationship.
          • Leo meets the age test.
  • The credit gets smaller once income passes $23,350.
```

### Write and test your own rules

```bash
npx factfinch validate my-rules.json
npx factfinch test my-rules.json my-rules.cases.json
npx factfinch run my-rules.json saved-answers.json
```

## How it works

Every fact is either **known** (with a value) or **unknown** (with the list of unanswered questions that could settle it). Logic short-circuits on what _is_ known: an `and` is false as soon as one part is false, however many other parts are unanswered. `and`/`or` look at their parts left to right, so the rules author controls which question comes first.

```json
"/eitc/eligible": {
  "type": "boolean",
  "derive": { "and": [
    { "fact": "/notADependent" },
    { "fact": "/eitc/ssnRule" },
    { "fact": "/eitc/hasEarnedIncome" },
    { "fact": "/eitc/investmentRule" }
  ]},
  "explain": {
    "true": "You meet the rules for the Earned Income Tax Credit.",
    "false": "You don't meet the rules for the Earned Income Tax Credit."
  }
}
```

The next question is the earliest-declared input among those still able to settle a result. Questions about each item in a collection (each child) stay together. When every result is known, the interview is over.

Explanations come from the same evaluation: every value records which facts decided it. A false `and` lists every part that failed (they all need fixing); a true `or` cites the first part that held. Facts with no wording of their own are looked through, so the tree shows only sentences a person can read.

See **[docs/rules-format.md](docs/rules-format.md)** for the full format: fact types, collections, every operator, templates, and known cases.

## API at a glance

| Call                                                   | What it does                                                   |
| ------------------------------------------------------ | -------------------------------------------------------------- |
| `FactGraph.load(rules)`                                | Validate and load a rules file                                 |
| `validateRules(rules)`                                 | List problems without throwing                                 |
| `graph.createSession(snapshot?)`                       | Start (or resume) one person's interview                       |
| `session.nextQuestion()` / `pendingQuestions()`        | What to ask next / everything that could still matter          |
| `session.set(path, value)` / `unset(path)`             | Answer (validated by type, bounds and options) / clear         |
| `session.addItem(collection, { name })` / `removeItem` | Manage collection items such as children                       |
| `session.get(path)` / `value(path)` / `display(path)`  | Evaluate any fact / its value / its value in plain words       |
| `session.results()` / `explain(path)`                  | Results with explanation trees                                 |
| `session.relevantAnswers()`                            | Answers the results actually depend on (for a review page)     |
| `session.toJSON()`                                     | Snapshot to save and restore later                             |
| `session.subscribe(fn)` / `revision`                   | Change notifications (works with React `useSyncExternalStore`) |
| `runCases(graph, casesFile)`                           | Run known cases as full interviews                             |
| `parseAnswer(question, text)`                          | Turn typed text ("$1,250", "yes", "2") into an answer          |

All errors are `FactfinchError` with a stable `code` (`INVALID_ANSWER`, `UNKNOWN_FACT`, `INVALID_RULES`, ...).

## The EITC and Child Tax Credit rules

The bundled rules estimate, for **tax year 2025**:

- **Earned Income Tax Credit** — eligibility (SSN, residency, filing status, investment income limit of $11,950, age 25–64 without children, qualifying child tests) and the amount, following the IRS EIC table method ($50 rows, figured at each row's midpoint, using the smaller of the earned-income and AGI amounts in the phase-out range). Figures from Rev. Proc. 2024-40.
- **Child Tax Credit** — $2,200 per qualifying child under 17, with the 2025 requirement that you (or your spouse, filing jointly) have an SSN valid for work; phase-out of $50 per $1,000 over $200,000 ($400,000 joint).
- **Credit for other dependents** — $500 for dependents who don't qualify for the CTC (for example a 17-year-old, or a child without an SSN).
- **Refundable part (Additional Child Tax Credit)** — up to $1,700 per child, limited to 15% of earned income over $2,500.

**Known simplifications** (also recorded as `notes` in the rules file): AGI is estimated as wages + self-employment + investment + other income, without above-the-line adjustments; dependents are limited to qualifying children (not qualifying relatives); children under 18 are assumed not to file joint returns; the refundable CTC is an upper bound assuming no income tax owed, and does not apply the Social Security tax method for 3+ children; people who can be claimed as a dependent are treated as ineligible for both credits.

> This is an estimate for information only, not tax advice and not a tax return. Check [IRS.gov](https://www.irs.gov/credits-deductions/individuals/earned-income-tax-credit-eitc) or a free [VITA](https://www.irs.gov/individuals/free-tax-return-preparation-for-qualifying-taxpayers) site before you file.

## Development

Requires Node.js 20 or newer.

```bash
npm ci               # install (npm workspaces)
npm run dev          # build the library and start the demo at http://localhost:5173
npm test             # unit tests + every known case
npm run ci           # everything CI runs: format, lint, typecheck, coverage, build, rules check
```

| Script                         | Purpose                                                    |
| ------------------------------ | ---------------------------------------------------------- |
| `npm run build`                | Build the library (ESM, CJS, types, CLI) and demo          |
| `npm run test:coverage`        | Tests with coverage thresholds                             |
| `npm run lint`                 | ESLint                                                     |
| `npm run format`               | Prettier                                                   |
| `npm run typecheck`            | TypeScript, library and demo                               |
| `npm run validate:rules`       | Validate the bundled rules and run their cases via the CLI |
| `npm run version:set -- 0.2.0` | Set the version across every package                       |

## Versioning, builds and releases

Factfinch follows [Semantic Versioning](https://semver.org). Every package in the repo shares one version; releases are git tags `vX.Y.Z`. Every CI build is stamped with a **build number** (the GitHub Actions run number) and commit, visible via `npx factfinch --version` (`0.1.0+build.42 (abc123…)`), `BUILD_INFO` in the library, and the demo's footer.

Rules files carry their own version (`2025.1.0`), so a rules correction can ship without an engine change.

Pushing a tag builds, tests and publishes a GitHub release with the npm tarball, the built demo, the rules files and SHA-256 checksums (and publishes to npm when an `NPM_TOKEN` secret is configured). See [docs/releasing.md](docs/releasing.md) and the [changelog](CHANGELOG.md).

## CI/CD

| Workflow                                       | When              | What                                                                            |
| ---------------------------------------------- | ----------------- | ------------------------------------------------------------------------------- |
| [`ci.yml`](.github/workflows/ci.yml)           | Every push and PR | Format, lint, typecheck, tests with coverage on Node 20/22/24; build; pack      |
| [`pages.yml`](.github/workflows/pages.yml)     | Push to `main`    | Test, build and deploy the demo to GitHub Pages                                 |
| [`release.yml`](.github/workflows/release.yml) | Tag `v*.*.*`      | Verify tag = version, full CI, GitHub release with assets, optional npm publish |

## Contributing

Contributions are welcome — especially new rules files and known cases. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[Apache License 2.0](LICENSE). Factfinch is an independent project and is not affiliated with or endorsed by the IRS.
