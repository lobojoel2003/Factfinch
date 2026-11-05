import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Question, Session, Value } from "factfinch";
import { graph } from "../rules";
import { forget, loadSaved, save } from "./storage";
import { INTRO, isView, sameView, type View } from "./view";

/** What we keep in each browser history entry. */
interface HistoryEntry {
  factfinch: true;
  view: View;
  /** The view this entry was reached from, so Back can reuse the browser's history. */
  prev?: View;
}

function entry(state: unknown): HistoryEntry | undefined {
  const e = state as HistoryEntry | null;
  return e?.factfinch && isView(e.view) ? e : undefined;
}

function tryQuestion(session: Session, path: string | null): Question | undefined {
  if (!path) return undefined;
  try {
    return session.question(path);
  } catch {
    return undefined; // e.g. the child it was about has been removed
  }
}

/** What to actually show for a view, given the current answers. */
export type Resolved =
  { screen: "intro" } | { screen: "interview"; question: Question } | { screen: "results" };

export function resolveView(view: View, session: Session): Resolved {
  if (view.screen === "intro") return { screen: "intro" };
  if (view.screen === "interview") {
    const question = tryQuestion(session, view.current) ?? session.nextQuestion();
    return question ? { screen: "interview", question } : { screen: "results" };
  }
  // Answers can change after the results were shown (say, via the browser's
  // Back button); if more questions are needed, ask them first.
  const next = session.nextQuestion();
  return next ? { screen: "interview", question: next } : { screen: "results" };
}

/**
 * The demo's state: one Factfinch session plus where the person is. Progress
 * is saved in localStorage, and every screen is a browser history entry, so
 * the browser's Back and Forward buttons move through the interview.
 */
export function useInterview() {
  const [saved] = useState(() => loadSaved(graph.version));
  const session = useMemo(() => {
    try {
      return graph.createSession(saved?.snapshot);
    } catch {
      return graph.createSession();
    }
  }, [saved]);
  const [view, setView] = useState<View>(() => saved?.view ?? INTRO);
  const viewRef = useRef(view);

  const revision = useSyncExternalStore(
    useCallback((onChange: () => void) => session.subscribe(onChange), [session]),
    () => session.revision,
  );

  // Save progress after every change; with no answers, keep nothing at all.
  useEffect(() => {
    viewRef.current = view;
    const snapshot = session.toJSON();
    if (Object.keys(snapshot.answers).length === 0) forget();
    else save({ snapshot, view });
  }, [session, view, revision]);

  // Browser history: claim the current entry, then follow Back/Forward.
  useEffect(() => {
    const prev = entry(window.history.state)?.prev;
    const current: HistoryEntry = { factfinch: true, view: viewRef.current };
    if (prev) current.prev = prev;
    window.history.replaceState(current, "");
    const onPop = (event: PopStateEvent) => {
      const e = entry(event.state);
      if (!e) return;
      viewRef.current = e.view;
      setView(e.view);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback((next: View) => {
    const e: HistoryEntry = { factfinch: true, view: next, prev: viewRef.current };
    window.history.pushState(e, "");
    viewRef.current = next;
    setView(next);
    window.scrollTo?.({ top: 0 });
  }, []);

  /** Go to the next unanswered question, or to the results when there is none. */
  const advance = useCallback(
    (trail: string[]) => {
      const next = session.nextQuestion();
      if (next) navigate({ screen: "interview", current: next.path, trail: [...trail, next.path] });
      else navigate({ screen: "results", current: null, trail });
    },
    [session, navigate],
  );

  const start = useCallback(() => advance(viewRef.current.trail), [advance]);

  /** Record an answer, then move on. Throws (and stays put) if the answer is invalid. */
  const answer = useCallback(
    (path: string, value: Value) => {
      session.set(path, value);
      const { trail } = viewRef.current;
      const i = trail.indexOf(path);
      advance(i >= 0 ? trail.slice(0, i + 1) : [...trail, path]);
    },
    [session, advance],
  );

  /** Call after a question was answered some other way (the children editor). */
  const answered = useCallback(
    (path: string) => {
      const { trail } = viewRef.current;
      const i = trail.indexOf(path);
      advance(i >= 0 ? trail.slice(0, i + 1) : [...trail, path]);
    },
    [advance],
  );

  const back = useCallback(() => {
    const v = viewRef.current;
    let target: View;
    if (v.returnTo === "results") {
      target = { screen: "results", current: null, trail: v.trail };
    } else {
      const trail = v.trail.filter((p) => tryQuestion(session, p));
      const i = v.current ? trail.indexOf(v.current) : trail.length;
      target =
        i > 0
          ? { screen: "interview", current: trail[i - 1]!, trail }
          : { screen: "intro", current: null, trail };
    }
    // When the browser's previous entry is exactly where we're going, use it,
    // so the browser's Back and Forward buttons stay in step with ours.
    if (sameView(entry(window.history.state)?.prev, target)) window.history.back();
    else navigate(target);
  }, [session, navigate]);

  /** Open an answered question from the results page. */
  const edit = useCallback(
    (path: string) => {
      const { trail } = viewRef.current;
      navigate({
        screen: "interview",
        current: path,
        trail: trail.includes(path) ? trail : [...trail, path],
        returnTo: "results",
      });
    },
    [navigate],
  );

  /** Back to the start screen, keeping every answer. */
  const home = useCallback(() => navigate({ ...INTRO, trail: viewRef.current.trail }), [navigate]);

  /** Forget every answer. */
  const startOver = useCallback(() => {
    session.clear();
    forget();
    navigate(INTRO);
  }, [session, navigate]);

  /** Fill in a sample household and jump to its results. */
  const loadExample = useCallback(
    (answers: Record<string, Value>) => {
      session.batch(() => {
        session.clear();
        session.restore({ factfinch: 1, rules: { id: graph.id, version: graph.version }, answers });
      });
      navigate({
        screen: "results",
        current: null,
        trail: session.relevantAnswers().map((q) => q.path),
      });
    },
    [session, navigate],
  );

  return {
    session,
    view,
    revision,
    resolved: resolveView(view, session),
    start,
    answer,
    answered,
    back,
    edit,
    home,
    startOver,
    loadExample,
  };
}

export type Interview = ReturnType<typeof useInterview>;
