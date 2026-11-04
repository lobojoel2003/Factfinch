# Contributing to Factfinch

Thanks for helping. Bug reports, rule corrections, new rules files and known cases are all welcome.

## Setup

```bash
git clone https://github.com/lobojoel2003/Factfinch.git
cd Factfinch
npm ci
npm run dev    # demo at http://localhost:5173
npm test
```

Before opening a pull request, run everything CI runs:

```bash
npm run ci
```

## Changing rules

- Cite a source (IRS publication, form instructions, statute) in the pull request, and in the fact's `notes` when it isn't obvious.
- Add or update known cases in the matching `.cases.json` file. Work out expected amounts independently of the engine — by hand or from IRS tables — not by copying what the engine prints.
- Use `expectNotAsked` or `expectAsked` when a change is about which questions are asked.
- Keep questions in plain words a person filing for the first time would understand. Put detail in `help`.
- Bump the rules file's `version`.

See [docs/rules-format.md](docs/rules-format.md) for the format.

## Changing the engine

- Add tests next to the behaviour you change (`packages/factfinch/test`). Coverage thresholds are enforced.
- Keep the library free of runtime dependencies.
- Note user-facing changes under `## [Unreleased]` in `CHANGELOG.md`.

## Code style

Prettier and ESLint are configured; `npm run format` fixes formatting.

## Reporting problems

Please don't include real names, Social Security numbers or other personal details in issues. A downloaded answers file with names replaced is the most useful way to report a wrong result.
