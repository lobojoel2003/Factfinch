import type { RulesFile } from "../src/index.js";

/** A small rules file exercising every feature, used by the engine tests. */
export const tinyRules: RulesFile = {
  factfinch: 1,
  id: "tiny",
  title: "Tiny test rules",
  version: "1.0.0",
  constants: { limit: 100, perPet: 10 },
  tables: { bonus: { "0": 0, "1": 5, "2": 8 } },
  facts: {
    "/isMember": {
      type: "boolean",
      label: "Member",
      question: { prompt: "Are you a member?", section: "About you" },
    },
    "/income": {
      type: "dollar",
      min: 0,
      label: "Income",
      question: { prompt: "What is your income?", help: "Limit is {{const:limit|dollar}}." },
    },
    "/color": {
      type: "enum",
      question: { prompt: "Favorite color?" },
      options: [
        { value: "red", label: "Red" },
        { value: "blue", label: "Blue" },
      ],
    },
    "/pets": {
      type: "collection",
      itemName: "name",
      question: { prompt: "List your pets.", itemNoun: "pet", addLabel: "Add a pet" },
    },
    "/pets/*/name": { type: "string", maxLength: 20, question: { prompt: "Pet name?" } },
    "/pets/*/age": {
      type: "integer",
      min: 0,
      max: 40,
      label: "{{item}}'s age",
      question: { prompt: "How old is {{item}}?" },
    },
    "/pets/*/isYoung": {
      type: "boolean",
      derive: { lt: [{ fact: "./age" }, 3] },
      explain: { true: "{{item}} is young.", false: "{{item}} is not young." },
    },
    "/lowIncome": {
      type: "boolean",
      derive: { lte: [{ fact: "/income" }, { const: "limit" }] },
      explain: { false: "Income of {{/income}} is over {{const:limit|dollar}}." },
    },
    "/eligible": {
      type: "boolean",
      label: "Eligible",
      derive: { and: [{ fact: "/isMember" }, { fact: "/lowIncome" }] },
      explain: { true: "You are eligible.", false: "You are not eligible." },
    },
    "/youngPets": {
      type: "integer",
      derive: { count: { in: "/pets", where: { fact: "./isYoung" } } },
      explain: { known: "Young pets: {{/youngPets}}." },
    },
    "/totalPetAge": { type: "integer", derive: { sum: { in: "/pets", of: { fact: "./age" } } } },
    "/benefit": {
      type: "dollar",
      label: "Benefit",
      derive: {
        if: [
          { fact: "/eligible" },
          {
            add: [
              { mul: [{ fact: "/youngPets" }, { const: "perPet" }] },
              { lookup: { table: "bonus", key: { min: [{ fact: "/youngPets" }, 2] } } },
            ],
          },
          0,
        ],
      },
      explain: { known: "Your benefit is {{/benefit}}.", zero: "No benefit." },
    },
  },
  results: [{ fact: "/benefit", label: "Benefit" }],
};

export function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}
