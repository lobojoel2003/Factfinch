# Writing a rules file

A rules file is one JSON document. It declares **facts** and which of them are **results**. Add `"$schema"` to get autocomplete and checking in your editor:

```json
{
  "$schema": "./node_modules/factfinch/schema/factfinch-rules.schema.json",
  "factfinch": 1,
  "id": "my-benefit",
  "title": "My benefit checker",
  "version": "1.0.0",
  "constants": { "incomeLimit": 30000 },
  "facts": {},
  "results": [{ "fact": "/benefit/amount", "label": "Monthly benefit" }]
}
```

| Field         | Required | Meaning                                                                     |
| ------------- | -------- | --------------------------------------------------------------------------- |
| `factfinch`   | yes      | Format version. Always `1` for now.                                         |
| `id`          | yes      | Stable identifier. Saved sessions and cases files refer to it.              |
| `title`       | yes      | Human title.                                                                |
| `version`     | yes      | Version of these rules (independent of the library version).                |
| `description` |          | Shown on the start screen.                                                  |
| `disclaimer`  |          | Shown with results.                                                         |
| `sources`     |          | `[{ "title", "url" }]` — where the rules come from.                         |
| `constants`   |          | Named numbers, strings or booleans, read with `{"const": "name"}`.          |
| `tables`      |          | Named lookup tables `{ "key": value }`, read with `lookup`.                 |
| `facts`       | yes      | Map of path → fact definition. **Order matters**: it is the asking order.   |
| `results`     | yes      | The facts the interview must settle. The interview ends when all are known. |

Check a file with `npx factfinch validate my-rules.json`, or `validateRules(json)` in code. The validator catches unknown references, wrong arity, missing options, relative references outside collections, circular definitions and more, and reports each problem with its location.

## Facts

Paths look like `/income/wages`. A fact is either an **input** (it has a `question`) or **derived** (it has a `derive` expression) — never both.

```json
"/income/wages": {
  "type": "dollar",
  "min": 0,
  "label": "Pay from jobs",
  "question": {
    "section": "Income",
    "prompt": "How much did you earn from jobs in 2025, before taxes?",
    "help": "Add up box 1 of every W-2. Enter 0 if none.",
    "placeholder": "0"
  }
}
```

| Field        | Applies to   | Meaning                                                                                                  |
| ------------ | ------------ | -------------------------------------------------------------------------------------------------------- |
| `type`       | all          | `boolean`, `integer`, `number`, `dollar`, `string`, `enum`, `collection`                                 |
| `label`      | all          | Short noun phrase for explanations and review screens. Templates allowed.                                |
| `question`   | inputs       | `prompt` (required), `help`, `section`, `placeholder`, `trueLabel`, `falseLabel`, `addLabel`, `itemNoun` |
| `derive`     | derived      | An expression (below).                                                                                   |
| `options`    | `enum`       | `[{ "value", "label", "help"? }]`                                                                        |
| `min`, `max` | numbers      | Inclusive bounds checked on answers.                                                                     |
| `maxLength`  | `string`     | Longest allowed answer.                                                                                  |
| `itemName`   | `collection` | Item fact that names each item, e.g. `"name"`.                                                           |
| `maxItems`   | `collection` | Most items allowed.                                                                                      |
| `explain`    | derived      | Plain-language sentences (below).                                                                        |
| `notes`      | all          | Notes for rule authors (citations, simplifications). Ignored by the engine.                              |

### Asking order

The next question is the earliest-declared input among the questions that could settle a result _right now_. Declare inputs in the order a person would expect to be asked. Within `and`/`or`, parts are considered left to right, so put the part most likely to settle things first:

```json
{ "and": [{ "fact": "/notADependent" }, { "fact": "/eitc/hasEarnedIncome" }] }
```

Here the dependency question is asked before income, and if it rules the person out, income is never asked for this result.

## Collections

A collection is a list of items, each with its own facts. Use `*` in definition paths:

```json
"/children":        { "type": "collection", "itemName": "name",
                      "question": { "prompt": "Add each child who lived with you.", "itemNoun": "child", "addLabel": "Add a child" } },
"/children/*/name": { "type": "string", "question": { "prompt": "What is this child's first name?" } },
"/children/*/age":  { "type": "integer", "min": 0, "question": { "prompt": "How old was {{item}}?" } },
"/children/*/isYoung": { "type": "boolean", "derive": { "lt": [{ "fact": "./age" }, 17] } }
```

- An answer to a collection is a list of item ids: `session.set("/children", ["c1", "c2"])`, or use `session.addItem("/children", { name: "Sam" })`.
- Concrete paths name items with `#`: `/children/#c1/age`.
- Inside an item, `./age` means "this item's age". Item facts can also read top-level facts (`/you/age`).
- Top-level facts read items only through `count` and `sum`.
- All of one item's questions are asked together, item by item.

## Expressions

Each operator is a one-key object. Literals (`3`, `"single"`, `true`) are expressions too.

| Operator                | Form                                                  | Notes                                                                   |
| ----------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------- |
| `fact`                  | `{"fact": "/path"}` or `{"fact": "./x"}`              | Value of another fact                                                   |
| `const`                 | `{"const": "name"}`                                   | A constant                                                              |
| `and`                   | `{"and": [e, ...]}`                                   | False once any part is false; asks parts left to right                  |
| `or`                    | `{"or": [e, ...]}`                                    | True once any part is true; asks parts left to right                    |
| `not`                   | `{"not": e}`                                          |                                                                         |
| `if`                    | `{"if": [cond, then, else]}`                          | Only the condition is asked first; settled early if both branches agree |
| `eq` `neq`              | `{"eq": [a, b]}`                                      | Any values                                                              |
| `gt` `gte` `lt` `lte`   | `{"gt": [a, b]}`                                      | Numbers                                                                 |
| `in`                    | `{"in": [e, ["a", "b"]]}`                             | Membership in a literal list                                            |
| `add` `mul` `min` `max` | `{"add": [a, b, ...]}`                                | `mul` by a known 0 is 0 even if other parts are unknown                 |
| `sub` `div`             | `{"sub": [a, b]}`                                     | Division by zero is an error                                            |
| `round` `floor` `ceil`  | `{"round": e}`                                        | Whole numbers; halves round away from zero                              |
| `count`                 | `{"count": {"in": "/children", "where": e}}`          | `where` is evaluated per item (`./x` refers to the item)                |
| `sum`                   | `{"sum": {"in": "/children", "of": e, "where": e?}}`  |                                                                         |
| `lookup`                | `{"lookup": {"table": "t", "key": e, "default": e?}}` | Keys are matched as strings                                             |

Errors inside parts that come _after_ the deciding part of an `and`/`or` are ignored, so guards work:

```json
{ "and": [{ "gt": [{ "fact": "/x" }, 0] }, { "gt": [{ "div": [100, { "fact": "/x" }] }, 5] }] }
```

## Explanations

`explain` holds sentences for each kind of value:

```json
"explain": {
  "true":  "{{item}} is your qualifying child.",
  "false": "{{item}} isn't your qualifying child.",
  "zero":  "You don't get the credit.",
  "known": "Your credit is {{/eitc/amount}}."
}
```

- Booleans use `true`/`false` (falling back to `known`). Numbers use `zero` for 0, otherwise `known`.
- A fact with no sentence for its value is _looked through_: its own reasons are shown in its place.
- An empty string (`""`) means "this doesn't matter here": the fact **and** its reasons are hidden.
- A false `and` cites every failing part; a true `or` cites its first true part.

### Templates

Prompts, help, labels and explanations can include:

| Template                | Becomes                                                         |
| ----------------------- | --------------------------------------------------------------- |
| `{{/income/wages}}`     | The fact's value, formatted by type (`$27,500`)                 |
| `{{./name}}`            | A fact on the current item                                      |
| `{{item}}`              | The current item's name ("Maya", or "Child 2")                  |
| `{{const:ctcPerChild}}` | A constant                                                      |
| `{{... \| dollar}}`     | Formats: `dollar`, `number`, `percent`, `yesno`, `lower`, `raw` |

## Known cases

A cases file lists people and the results they must get:

```json
{
  "$schema": "./node_modules/factfinch/schema/factfinch-cases.schema.json",
  "rules": "my-benefit",
  "cases": [
    {
      "name": "Someone else can claim you",
      "answers": { "/you/claimedAsDependent": true },
      "expect": { "/eitc/amount": 0, "/ctc/total": 0 },
      "expectAsked": ["/you/claimedAsDependent"]
    }
  ]
}
```

Each case runs as a full interview: the engine asks, and the case's `answers` reply. A case fails if:

- an `expect` value is wrong or still unknown,
- the engine asks a question the case has no answer for (a sign of a missing answer, or of a rule asking more than it should),
- a path in `expectNotAsked` was asked, or the order differs from `expectAsked`.

Extra answers are fine — they're simply never asked for. Run cases with `npx factfinch test rules.json rules.cases.json`, or `runCases(graph, cases)` inside your own test runner.
