import { formatDollar } from "factfinch";
import buildInfo from "./build-info.json";
import { QuestionView } from "./components/QuestionView";
import { Results } from "./components/Results";
import { examples, graph, useInterview } from "./interview";

const REPO = "https://github.com/lobojoel2003/Factfinch";

export function App() {
  const ui = useInterview();
  const { session, screen } = ui;
  const question = screen === "interview" && ui.current ? safeQuestion(ui.current) : undefined;
  const answeredCount = Object.keys(session.allAnswers()).length;

  function safeQuestion(path: string) {
    try {
      return session.question(path);
    } catch {
      return session.nextQuestion();
    }
  }

  return (
    <div className="app">
      <header className="top">
        <a className="brand" href="./" onClick={(e) => (e.preventDefault(), ui.reset())}>
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={28} height={28} />
          <span>Factfinch</span>
        </a>
        <span className="badge">EITC + Child Tax Credit · 2025</span>
      </header>

      <main id="main">
        {screen === "intro" && (
          <section className="card intro">
            <p className="eyebrow">Free · private · no sign-up</p>
            <h1>Find out if you can get the Earned Income Tax Credit and the Child Tax Credit</h1>
            <p className="lede">{graph.rules.description}</p>
            <ul className="points">
              <li>
                <strong>Plain questions.</strong> No tax forms or jargon.
              </li>
              <li>
                <strong>Only what's needed.</strong> Questions that can't change your result are
                skipped.
              </li>
              <li>
                <strong>Every answer explained.</strong> See exactly which rule decided each result.
              </li>
              <li>
                <strong>Stays on your device.</strong> Nothing you enter is sent anywhere.
              </li>
            </ul>
            <div className="row-actions">
              <button type="button" className="primary big" onClick={ui.start}>
                {answeredCount > 0 ? "Continue where you left off" : "Start"}
              </button>
              {answeredCount > 0 && (
                <button type="button" className="link" onClick={ui.reset}>
                  Start over
                </button>
              )}
            </div>
            <details className="examples">
              <summary>Or try an example household</summary>
              <ul>
                {examples.map((ex) => (
                  <li key={ex.name}>
                    <button
                      type="button"
                      className="link"
                      onClick={() => ui.loadExample(ex.answers)}
                    >
                      {ex.name}
                    </button>
                  </li>
                ))}
              </ul>
            </details>
            <p className="disclaimer">{graph.rules.disclaimer}</p>
          </section>
        )}

        {screen === "interview" && question && (
          <>
            <QuestionView
              key={question.path}
              session={session}
              question={question}
              onAnswered={ui.answered}
              onBack={ui.back}
            />
            {renderSoFar()}
          </>
        )}

        {screen === "results" && (
          <Results session={session} onEdit={ui.edit} onRestart={ui.reset} />
        )}
      </main>

      <footer className="foot">
        <p>
          Built with{" "}
          <a href={REPO} rel="noreferrer">
            Factfinch
          </a>
          , an open-source plain-language rules engine inspired by the IRS Direct File Fact Graph.
          Rules: {graph.rules.id} v{graph.version}.
        </p>
        <p className="build">
          v{buildInfo.version} · build {buildInfo.build} ·{" "}
          <a href={`${REPO}/commit/${buildInfo.commit}`} rel="noreferrer">
            {buildInfo.commit.slice(0, 7)}
          </a>
        </p>
      </footer>
    </div>
  );

  /** Live view of what the engine already knows, updating as you answer. */
  function renderSoFar() {
    const results = session.results({ maxDepth: 0 });
    return (
      <aside className="card sofar" aria-label="What we know so far">
        <h3>So far</h3>
        <ul>
          {results.map((r) => (
            <li key={r.fact}>
              <span>{r.label}</span>
              <strong className={r.known ? "" : "muted"}>
                {r.known ? formatDollar(Number(r.value)) : "still working it out"}
              </strong>
            </li>
          ))}
        </ul>
        <p className="muted small">
          {answeredCount} answered. The engine stops asking as soon as your results are settled.
        </p>
      </aside>
    );
  }
}
