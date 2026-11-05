import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "../src/App";

type User = ReturnType<typeof userEvent.setup>;

function setup() {
  const user = userEvent.setup();
  const view = render(<App />);
  return { user, ...view };
}

const prompt = () => screen.getByRole("heading", { level: 1 }).textContent ?? "";
const button = (name: string | RegExp) => screen.getByRole("button", { name });

async function type(user: User, value: string) {
  const input = screen.getByRole("textbox");
  await user.clear(input);
  await user.type(input, value);
  await user.click(button("Continue"));
}

/** A head of household with one 7-year-old, earning $27,500. */
const family: [RegExp, (user: User) => Promise<void>][] = [
  [/claim you as a dependent/, (u) => u.click(button("No"))],
  [/Do you have a Social Security number/, (u) => u.click(button("Yes"))],
  [/filing status/, (u) => u.click(button(/^Head of household/))],
  [/citizen or resident alien/, (u) => u.click(button("Yes"))],
  [
    /Add each child/,
    async (u) => {
      await u.click(button(/Add a child/));
      await u.type(screen.getByRole("textbox", { name: "First name of child 1" }), "Maya");
      await u.click(button("Continue"));
    },
  ],
  [/How is Maya related/, (u) => u.click(button(/^Son or daughter/))],
  [/How old was Maya/, (u) => type(u, "7")],
  [/How old were you/, (u) => type(u, "34")],
  [/Did Maya live with you/, (u) => u.click(button("Yes"))],
  [/Will someone else/, (u) => u.click(button("No"))],
  [/Did Maya pay/, (u) => u.click(button("No"))],
  [/Is Maya a U.S. citizen/, (u) => u.click(button("Yes"))],
  [/Does Maya have a Social Security/, (u) => u.click(button("Yes"))],
  [/earn from jobs/, (u) => type(u, "27,500")],
  [/work for yourself/, (u) => u.click(button("No"))],
  [/investment income/, (u) => type(u, "0")],
  [/other taxable income/, (u) => u.click(button("No"))],
  [/main home in the United States/, (u) => u.click(button("Yes"))],
];

async function answerUntil(user: User, stop: (p: string) => boolean = () => false) {
  for (let i = 0; i < 40 && !screen.queryByText(/How we worked it out/); i++) {
    const p = prompt();
    if (stop(p)) return;
    const step = family.find(([re]) => re.test(p));
    if (!step) throw new Error(`Unexpected question: ${p}`);
    await step[1](user);
  }
}

describe("the EITC / Child Tax Credit demo", () => {
  it("walks a family through to explained results", async () => {
    const { user } = setup();
    await user.click(button("Start"));
    await answerUntil(user);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "You may get about $5,861 in credits",
    );
    expect(screen.getByText(/Up to \$5,361 of that can be paid to you as a refund/)).toBeTruthy();
    const amounts = screen
      .getAllByText(/^\$[\d,]+$/, { selector: ".amount" })
      .map((e) => e.textContent);
    expect(amounts).toEqual(["$3,661", "$2,200", "$1,700"]);
    expect(
      screen.getAllByText("Maya qualifies for the $2,200 Child Tax Credit.").length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole("listitem", { current: "step" })).toHaveTextContent("Your results");
  });

  it("stops after one question when someone else can claim you", async () => {
    const { user } = setup();
    await user.click(button("Start"));
    await user.click(button("Yes"));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("don't qualify");
    const answers = screen.getByRole("region", { name: "Your answers" });
    expect(within(answers).getAllByRole("term")).toHaveLength(1);
    expect(
      screen.getAllByText(/Someone else can claim you as a dependent\./).length,
    ).toBeGreaterThan(0);
  });

  it("goes back to the previous question with its answer selected", async () => {
    const { user } = setup();
    await user.click(button("Start"));
    await user.click(button("No"));
    expect(prompt()).toMatch(/Social Security/);
    await user.click(button(/Back/));
    expect(prompt()).toMatch(/claim you as a dependent/);
    expect(button("No")).toHaveAttribute("aria-pressed", "true");
    expect(button("Yes")).toHaveAttribute("aria-pressed", "false");
  });

  it("follows the browser's Back button", async () => {
    const { user } = setup();
    await user.click(button("Start"));
    await user.click(button("No"));
    await user.click(button("Yes"));
    expect(prompt()).toMatch(/filing status/);
    act(() => window.history.back());
    await waitFor(() => expect(prompt()).toMatch(/Social Security/));
    act(() => window.history.forward());
    await waitFor(() => expect(prompt()).toMatch(/filing status/));
  });

  it("checks typed amounts and shows friendly errors", async () => {
    const { user } = setup();
    await user.click(button("Start"));
    await answerUntil(user, (p) => /earn from jobs/.test(p));
    await type(user, "a lot");
    expect(screen.getByRole("alert")).toHaveTextContent("Please enter an amount in dollars");
    expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
    await type(user, "-5");
    expect(screen.getByRole("alert")).toHaveTextContent("Must be at least 0.");
    await type(user, "27500");
    expect(prompt()).toMatch(/work for yourself/);
  });

  it("asks for a name for each child, and unique names", async () => {
    const { user } = setup();
    await user.click(button("Start"));
    await answerUntil(user, (p) => /Add each child/.test(p));
    await user.click(button(/Add a child/));
    await user.click(button("Continue"));
    expect(screen.getByRole("alert")).toHaveTextContent("Please enter a first name for each child");

    await user.type(screen.getByRole("textbox", { name: "First name of child 1" }), "Sam");
    await user.click(button(/Add a child/));
    // The new row gets focus, so typing goes straight into it; Enter submits.
    await user.keyboard("sam{Enter}");
    expect(screen.getByRole("alert")).toHaveTextContent("Two entries are named sam");

    await user.click(button("Remove sam"));
    await user.click(button("Continue"));
    expect(prompt()).toMatch(/How is Sam related to you/);
  });

  it("continues with no children", async () => {
    const { user } = setup();
    await user.click(button("Start"));
    await answerUntil(user, (p) => /Add each child/.test(p));
    expect(screen.getByText("No one added yet.")).toBeTruthy();
    await user.click(button("No one to add — continue"));
    // Earnings come first in the EITC rule: without any, age can't matter.
    expect(prompt()).toMatch(/earn from jobs/);
  });

  it("loads an example, and Change returns to the results", async () => {
    const { user } = setup();
    await user.click(button(/Head of household, one child, \$30,000/));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("$5,461");

    await user.click(button(/Change your answer to: How much did you earn/));
    expect(screen.getByRole("textbox")).toHaveValue("30,000");
    await user.click(button(/Back to results/));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("$5,461");

    await user.click(button(/Change your answer to: How much did you earn/));
    await type(user, "60000");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("$2,200");
  });

  it("asks before clearing answers", async () => {
    const { user } = setup();
    await user.click(button(/Single worker, no children/));
    await user.click(button("Start over"));
    expect(screen.getByRole("group", { name: "Clear all your answers?" })).toBeTruthy();
    await user.click(button("Cancel"));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("$649");

    await user.click(button("Start over"));
    await user.click(button("Yes, clear them"));
    expect(button("Start")).toBeTruthy();
    expect(localStorage.length).toBe(0);
  });

  it("keeps answers when going home, and after a reload", async () => {
    const first = setup();
    await first.user.click(button("Start"));
    await first.user.click(button("No"));
    await first.user.click(button("Factfinch home"));
    expect(button("Continue where you left off")).toBeTruthy();
    await first.user.click(button("Continue where you left off"));
    expect(prompt()).toMatch(/Social Security/);
    first.unmount();

    // A fresh page load picks up where the person was.
    setup();
    expect(prompt()).toMatch(/Social Security/);
  });

  it("can show every reason at once", async () => {
    const { user } = setup();
    await user.click(button(/Head of household, one child/));
    const closedBefore = document.querySelectorAll("details:not([open])").length;
    expect(closedBefore).toBeGreaterThan(0);
    await user.click(button("Show every reason"));
    expect(document.querySelectorAll("details:not([open])")).toHaveLength(0);
  });
});
