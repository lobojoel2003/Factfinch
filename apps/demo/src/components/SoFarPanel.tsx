import type { Session } from "factfinch";

/** Live view of what the engine already knows. It updates with every answer. */
export function SoFarPanel({ session }: { session: Session }) {
  const results = session.results({ maxDepth: 0 });
  const answered = Object.keys(session.allAnswers()).length;
  return (
    <aside className="card sofar" aria-labelledby="sofar-title">
      <h2 id="sofar-title" className="h3">
        So far
      </h2>
      <ul aria-live="polite">
        {results.map((r) => (
          <li key={r.fact} className={r.known ? "known" : ""}>
            <span>{r.label}</span>
            <strong>
              {r.known ? r.display : <span className="pending">working it out…</span>}
            </strong>
          </li>
        ))}
      </ul>
      <p className="small muted">
        {answered === 1 ? "1 answer" : `${answered} answers`} so far. Questions that can&apos;t
        change a result are skipped, and the interview ends as soon as every result is settled.
      </p>
    </aside>
  );
}
