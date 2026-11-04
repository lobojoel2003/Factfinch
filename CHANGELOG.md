# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/lobojoel2003/Factfinch/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/lobojoel2003/Factfinch/releases/tag/v0.1.0
