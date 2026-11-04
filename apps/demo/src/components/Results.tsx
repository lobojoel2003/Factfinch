import { formatDollar, type Explanation, type Session } from "factfinch";

/** A collapsible "why" tree. Derived facts open by default at the top level. */
function Reason({ node, depth }: { node: Explanation; depth: number }) {
  const sentence = node.text ?? `${node.label}: ${node.display}`;
  const cls = node.kind === "input" ? "reason input" : `reason ${verdict(node)}`;
  if (node.children.length === 0) {
    return (
      <li className={cls}>
        <span>
          {node.kind === "input" && <span className="sr-only">Your answer: </span>}
          {sentence}
        </span>
      </li>
    );
  }
  return (
    <li className={cls}>
      <details open={depth < 1}>
        <summary>{sentence}</summary>
        <ul>
          {node.children.map((c) => (
            <Reason key={c.path} node={c} depth={depth + 1} />
          ))}
        </ul>
      </details>
    </li>
  );
}

function verdict(node: Explanation): string {
  if (node.value === true) return "yes";
  if (node.value === false) return "no";
  return "";
}

export function Results({
  session,
  onEdit,
  onRestart,
}: {
  session: Session;
  onEdit: (path: string) => void;
  onRestart: () => void;
}) {
  const results = session.results();
  const total = results
    .filter((r) => r.fact !== "/ctc/refundable")
    .reduce((sum, r) => sum + (typeof r.value === "number" ? r.value : 0), 0);
  const refundable = results
    .filter((r) => r.fact !== "/ctc/total")
    .reduce((sum, r) => sum + (typeof r.value === "number" ? r.value : 0), 0);
  const answers = session.relevantAnswers();

  const download = () => {
    const blob = new Blob([JSON.stringify(session.toJSON(), null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "factfinch-answers.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="results">
      <section className="card hero" aria-live="polite">
        <p className="eyebrow">Your estimate for tax year 2025</p>
        {total > 0 ? (
          <>
            <h2>
              You may get about <strong>{formatDollar(total)}</strong> in credits
            </h2>
            <p className="lede">
              Up to <strong>{formatDollar(refundable)}</strong> of that can come back to you as a
              refund, even if you owe no income tax.
            </p>
          </>
        ) : (
          <>
            <h2>It looks like you don't qualify for these credits</h2>
            <p className="lede">
              The reasons are below. If something changes, you can edit any answer.
            </p>
          </>
        )}
      </section>

      {results.map((r) => (
        <section key={r.fact} className="card result">
          <div className="result-head">
            <div>
              <h3>{r.label}</h3>
              {r.description && <p className="muted">{r.description}</p>}
            </div>
            <p className={`amount ${r.value === 0 ? "zero" : ""}`}>{r.display}</p>
          </div>
          <h4>Why</h4>
          <ul className="reasons">
            {r.explanation.text && <li className="reason lead">{r.explanation.text}</li>}
            {r.explanation.children.map((c) => (
              <Reason key={c.path} node={c} depth={0} />
            ))}
          </ul>
        </section>
      ))}

      <section className="card">
        <h3>Your answers</h3>
        <p className="muted">
          These are the answers your results depend on. Questions that couldn't change your result
          were skipped.
        </p>
        <dl className="answers">
          {answers.map((q) => (
            <div key={q.path} className="answer-row">
              <dt>{q.prompt}</dt>
              <dd>
                <span>{session.display(q.path)}</span>
                <button type="button" className="link" onClick={() => onEdit(q.path)}>
                  Change<span className="sr-only"> answer to: {q.prompt}</span>
                </button>
              </dd>
            </div>
          ))}
        </dl>
        <div className="row-actions">
          <button type="button" className="secondary" onClick={download}>
            Download my answers
          </button>
          <button type="button" className="link danger" onClick={onRestart}>
            Start over
          </button>
        </div>
      </section>

      <p className="disclaimer">{session.graph.rules.disclaimer}</p>
    </div>
  );
}
