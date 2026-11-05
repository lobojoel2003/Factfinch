import { useState } from "react";
import type { Question, Session } from "factfinch";
import { SUMMARY } from "../rules";
import { ConfirmButton } from "./ConfirmButton";
import { ReasonTree } from "./ReasonTree";

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  // Some browsers start the download asynchronously; don't revoke too early.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function bySection(questions: Question[]): [string, Question[]][] {
  const groups = new Map<string, Question[]>();
  for (const q of questions) {
    const key = q.section ?? "Other";
    groups.set(key, [...(groups.get(key) ?? []), q]);
  }
  return [...groups];
}

export function ResultsScreen({
  session,
  onEdit,
  onStartOver,
}: {
  session: Session;
  onEdit: (path: string) => void;
  onStartOver: () => void;
}) {
  const [openAll, setOpenAll] = useState(false);
  const results = session.results();
  const total = session.explain(SUMMARY.total);
  const refundable = session.explain(SUMMARY.refundable);
  const qualifies = typeof total.value === "number" && total.value > 0;
  const { rules } = session.graph;

  const print = () => {
    setOpenAll(true);
    // Let React open every reason before the print dialog takes its snapshot.
    setTimeout(() => window.print(), 50);
  };

  return (
    <div className="results">
      <section className={`card hero ${qualifies ? "good" : "none"}`} aria-labelledby="hero-title">
        <p className="eyebrow">
          Your estimate for tax year {String(rules.constants?.taxYear ?? "")}
        </p>
        {qualifies ? (
          <>
            <h1 id="hero-title">
              You may get about <span className="big-number">{total.display}</span> in credits
            </h1>
            <p className="lede">{refundable.text}</p>
          </>
        ) : (
          <>
            <h1 id="hero-title">It looks like you don&apos;t qualify for these credits</h1>
            <p className="lede">
              The reasons are below. If something changes, you can change any answer.
            </p>
          </>
        )}
      </section>

      <div className="results-toolbar">
        <h2 className="h3">How we worked it out</h2>
        <button
          type="button"
          className="link"
          onClick={() => setOpenAll((v) => !v)}
          aria-pressed={openAll}
        >
          {openAll ? "Show fewer reasons" : "Show every reason"}
        </button>
      </div>

      {results.map((r) => (
        <section key={r.fact} className="card result" aria-labelledby={`r-${r.fact}`}>
          <header className="result-head">
            <div>
              <h3 id={`r-${r.fact}`}>{r.label}</h3>
              {r.description && <p className="muted">{r.description}</p>}
            </div>
            <p className={`amount ${r.value === 0 ? "zero" : ""}`}>{r.display}</p>
          </header>
          {r.explanation.text && <p className="lead-reason">{r.explanation.text}</p>}
          <ReasonTree key={String(openAll)} explanation={r.explanation} openAll={openAll} />
        </section>
      ))}

      <section className="card" aria-labelledby="answers-title">
        <h2 id="answers-title" className="h3">
          Your answers
        </h2>
        <p className="muted">
          The answers these results depend on. Change one and the results update right away.
        </p>
        {bySection(session.relevantAnswers()).map(([section, questions]) => (
          <div key={section} className="answer-group">
            <h3 className="h4">{section}</h3>
            <dl className="answers">
              {questions.map((q) => (
                <div key={q.path} className="answer-row">
                  <dt>{q.prompt}</dt>
                  <dd>
                    <span>{session.display(q.path)}</span>
                    <button type="button" className="link" onClick={() => onEdit(q.path)}>
                      Change<span className="sr-only"> your answer to: {q.prompt}</span>
                    </button>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
        <div className="actions no-print">
          <button type="button" className="secondary" onClick={print}>
            Print or save as PDF
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() =>
              download("factfinch-answers.json", JSON.stringify(session.toJSON(), null, 2))
            }
          >
            Download my answers
          </button>
          <ConfirmButton
            label="Start over"
            question="Clear all your answers?"
            confirmLabel="Yes, clear them"
            onConfirm={onStartOver}
          />
        </div>
      </section>

      <section className="fine-print" aria-label="About this estimate">
        <p>{rules.disclaimer}</p>
        {rules.sources && rules.sources.length > 0 && (
          <p>
            Sources:{" "}
            {rules.sources.map((s, i) => (
              <span key={s.title}>
                {i > 0 && " · "}
                {s.url ? (
                  <a href={s.url} target="_blank" rel="noreferrer">
                    {s.title}
                  </a>
                ) : (
                  s.title
                )}
              </span>
            ))}
          </p>
        )}
      </section>
    </div>
  );
}
