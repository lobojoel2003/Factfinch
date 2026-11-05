import type { SessionSnapshot } from "factfinch";
import type { View } from "./view";

const KEY = "factfinch-demo:v2";

export interface Saved {
  snapshot: SessionSnapshot;
  view: View;
}

/** Read saved progress. Anything unreadable or for other rules is ignored. */
export function loadSaved(rulesVersion: string): Saved | undefined {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return undefined;
    const saved = JSON.parse(raw) as Saved;
    if (saved?.snapshot?.rules?.version !== rulesVersion || !saved.view) return undefined;
    return saved;
  } catch {
    return undefined;
  }
}

export function save(saved: Saved): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    // Private browsing or storage turned off: the demo still works, it just won't remember.
  }
}

export function forget(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to remove.
  }
}
