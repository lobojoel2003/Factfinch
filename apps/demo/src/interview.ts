import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { FactGraph, type Session, type SessionSnapshot } from "factfinch";
import rules from "factfinch/rules/us-eitc-ctc-2025.json";
import cases from "factfinch/rules/us-eitc-ctc-2025.cases.json";

export const graph = FactGraph.load(rules);

const STORAGE_KEY = "factfinch-demo:v1";

export type Screen = "intro" | "interview" | "results";

interface Saved {
  snapshot: SessionSnapshot;
  history: string[];
  current: string | null;
  screen: Screen;
}

function load(): Saved | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    const saved = JSON.parse(raw) as Saved;
    if (saved.snapshot?.rules?.version !== graph.version) return undefined;
    return saved;
  } catch {
    return undefined;
  }
}

function save(state: Saved | undefined): void {
  try {
    if (state) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private mode or storage disabled: the demo still works, it just won't remember.
  }
}

/** Sample households from the rules' own test cases. */
export const examples = [
  "Head of household, one child, $30,000",
  "Married filing jointly, three children, $45,000",
  "Mixed household: one child qualifies, one doesn't",
  "Single worker, no children, on the plateau",
]
  .map((name) => cases.cases.find((c) => c.name === name))
  .filter((c): c is (typeof cases.cases)[number] => c !== undefined);

/**
 * Interview state for the UI: the session plus a history stack so Back works.
 * Answers are saved in localStorage so a refresh doesn't lose progress.
 */
export function useInterview() {
  const [initial] = useState(load);
  const session = useMemo<Session>(() => {
    try {
      return graph.createSession(initial?.snapshot);
    } catch {
      return graph.createSession();
    }
  }, [initial]);
  const [history, setHistory] = useState<string[]>(initial?.history ?? []);
  const [current, setCurrent] = useState<string | null>(initial?.current ?? null);
  const [screen, setScreen] = useState<Screen>(initial?.screen ?? "intro");

  // Re-render whenever the session changes.
  const revision = useSyncExternalStore(
    useCallback((fn) => session.subscribe(fn), [session]),
    () => session.revision,
  );

  const persist = useCallback(
    (h: string[], c: string | null, s: Screen) =>
      save({ snapshot: session.toJSON(), history: h, current: c, screen: s }),
    [session],
  );

  const go = useCallback(
    (h: string[], c: string | null, s: Screen) => {
      setHistory(h);
      setCurrent(c);
      setScreen(s);
      persist(h, c, s);
      window.scrollTo?.({ top: 0 });
    },
    [persist],
  );

  /** Move to the next unanswered question, or to the results. */
  const advance = useCallback(
    (fromHistory: string[]) => {
      const next = session.nextQuestion();
      if (next) go([...fromHistory, next.path], next.path, "interview");
      else go(fromHistory, null, "results");
    },
    [session, go],
  );

  const start = useCallback(() => advance([]), [advance]);

  /** Call after the current question has been answered. */
  const answered = useCallback(() => {
    const idx = current ? history.indexOf(current) : -1;
    advance(idx >= 0 ? history.slice(0, idx + 1) : history);
  }, [advance, current, history]);

  const back = useCallback(() => {
    const live = history.filter((p) => {
      try {
        session.question(p);
        return true;
      } catch {
        return false; // item was removed
      }
    });
    const idx = current ? live.indexOf(current) : live.length;
    if (idx > 0) go(live, live[idx - 1]!, "interview");
    else go([], null, "intro");
  }, [current, history, session, go]);

  const edit = useCallback(
    (path: string) => {
      const idx = history.indexOf(path);
      go(idx >= 0 ? history : [...history, path], path, "interview");
    },
    [history, go],
  );

  const reset = useCallback(() => {
    for (const path of Object.keys(session.allAnswers())) {
      if (session.answer(path) !== undefined) session.unset(path);
    }
    go([], null, "intro");
  }, [session, go]);

  const loadExample = useCallback(
    (answers: Record<string, unknown>) => {
      reset();
      session.restore({
        factfinch: 1,
        rules: { id: graph.id, version: graph.version },
        answers: answers as SessionSnapshot["answers"],
      });
      const used = session.relevantAnswers().map((x) => x.path);
      go(used, null, "results");
    },
    [reset, session, go],
  );

  return {
    session,
    revision,
    history,
    current,
    screen,
    start,
    answered,
    back,
    edit,
    reset,
    loadExample,
    persist,
  };
}
