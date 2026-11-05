# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-11-05

### Added

- `Session.batch(fn)`: make several changes as one. Listeners are notified once, and if `fn` throws, every change it made is undone.
- `Session.clear()` removes every answer.
- `FactGraph.sections()` lists question sections in order, for progress bars.
- Known cases can carry `tags`; the demo offers cases tagged `"example"` as sample households.
- CLI: `--json` output for `validate`, `test` and `run`.
- Rules: `/summary/totalCredits` and `/summary/refundableCredits` facts, with explanations (rules version `2025.2.0`).
- Demo: progress steps, browser Back/Forward support, "Change" from the results page returns to the results, confirmation before clearing answers, print or save as PDF, answers grouped by section, sources listed, a new finch logo, and tests that drive the app like a person would.
- README: banner, screenshots in light and dark mode, phone screenshots and an animated walkthrough, all regenerated from the real app with `npm run screenshots`.

### Changed

- `Session.restore()` is all or nothing: if any answer in the snapshot is invalid, nothing changes. It now also rejects unknown snapshot formats.
- `addItem` with a name is a single change, so listeners are notified once.
- Unknown derived facts now display as "(not known yet)" rather than "(not answered yet)".
- The engine source is split into focused modules (`graph`, `session`, `answers`, `explain`); the public API is unchanged apart from the additions above.
- The CLI is now a testable `cli()` function with full test coverage; `bin.ts` connects it to the terminal.
- `parseAnswer` accepts numbers such as `.5` and `12.`.
- The demo reads the library's source directly in development, builds and tests.
- GitHub Actions updated to their latest major versions.

### Fixed

- The validator now rejects references containing `*` (such as `/children/*/age`), which could never resolve and silently left a fact unknown.
- The CLI exits quietly instead of crashing when its output is piped into a command that stops reading early, such as `head`.
- Demo: clicking the logo no longer clears your answers; question pages focus the input or the question correctly; an empty session leaves nothing in browser storage.

## [0.1.0] - 2026-11-04

First release.

### Added

- **Engine** (`factfinch` package): rules as JSON data, evaluated with three-valued logic so results can be worked out from incomplete answers.
  - Interview API: `nextQuestion()`, `pendingQuestions()`, `isComplete()` — only questions that can still change a result are asked.
  - Plain-language explanation trees for every result, built from `explain` templates.
  - Collections (such as children) with per-item questions and `count` / `sum` aggregates.
  - 25 expression operators, constants, lookup tables and `{{template}}` text.
  - Answer validation by type, bounds, options and length; JSON snapshots to save and resume.
  - `relevantAnswers()` for review screens; `subscribe()` / `revision` for UI frameworks.
  - Static rules validator with precise error locations, including cycle detection.
  - Known-case runner that replays each case as a full interview.
  - ESM + CommonJS builds with TypeScript types; no runtime dependencies.
- **CLI**: `factfinch validate`, `test`, `ask` (interactive), `run`, `--version`.
- **Rules**: `us-eitc-ctc-2025` — Earned Income Tax Credit, Child Tax Credit ($2,200 per child), credit for other dependents and the refundable Additional Child Tax Credit for tax year 2025, with 34 known cases.
- **JSON Schemas** for rules files and cases files.
- **Demo**: React app with an accessible step-by-step interview, children editor, live "so far" panel, explained results, answer review and editing, example households, saved progress, and dark mode.
- **CI/CD**: CI on Node 20, 22 and 24; GitHub Pages deployment; tag-driven releases with build numbers, checksummed assets and optional npm publishing.

[Unreleased]: https://github.com/lobojoel2003/Factfinch/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/lobojoel2003/Factfinch/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/lobojoel2003/Factfinch/releases/tag/v0.1.0
