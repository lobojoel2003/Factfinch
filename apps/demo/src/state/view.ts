export type Screen = "intro" | "interview" | "results";

/** Where the person is in the app. Stored in browser history and localStorage. */
export interface View {
  screen: Screen;
  /** The question being shown (interview screen only). */
  current: string | null;
  /** Questions shown so far, in order, so Back can retrace them. */
  trail: string[];
  /** Set when a question was opened with "Change" from the results page. */
  returnTo?: "results";
}

export const INTRO: View = { screen: "intro", current: null, trail: [] };

export function sameView(a: View | undefined, b: View | undefined): boolean {
  return !!a && !!b && a.screen === b.screen && a.current === b.current;
}

export function isView(value: unknown): value is View {
  const v = value as View | null;
  return (
    !!v &&
    typeof v === "object" &&
    (v.screen === "intro" || v.screen === "interview" || v.screen === "results") &&
    (v.current === null || typeof v.current === "string") &&
    Array.isArray(v.trail)
  );
}
