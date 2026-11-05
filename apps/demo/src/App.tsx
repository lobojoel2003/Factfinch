import buildInfo from "./build-info.json";
import { IntroScreen } from "./components/IntroScreen";
import { QuestionCard } from "./components/QuestionCard";
import { ResultsScreen } from "./components/ResultsScreen";
import { SoFarPanel } from "./components/SoFarPanel";
import { Stepper } from "./components/Stepper";
import { graph, REPO_URL, STEPS } from "./rules";
import { useInterview } from "./state/useInterview";

export function App() {
  const ui = useInterview();
  const { session, resolved, view } = ui;
  const hasProgress = Object.keys(session.allAnswers()).length > 0;

  const step =
    resolved.screen === "results"
      ? STEPS.length - 1
      : resolved.screen === "interview"
        ? Math.max(0, STEPS.indexOf(resolved.question.section ?? ""))
        : -1;

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="app">
        <header className="top">
          <button type="button" className="brand" onClick={ui.home} aria-label="Factfinch home">
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={32} height={32} />
            <span>Factfinch</span>
          </button>
          <span className="badge">
            EITC + Child Tax Credit · {String(graph.rules.constants?.taxYear ?? "")}
          </span>
        </header>

        {step >= 0 && <Stepper steps={STEPS} current={step} />}

        <main id="main" tabIndex={-1}>
          {resolved.screen === "intro" && (
            <IntroScreen
              hasProgress={hasProgress}
              onStart={ui.start}
              onStartOver={ui.startOver}
              onExample={ui.loadExample}
            />
          )}

          {resolved.screen === "interview" && (
            <div className="layout">
              <QuestionCard
                key={resolved.question.path}
                session={session}
                question={resolved.question}
                onAnswer={ui.answer}
                onAnswered={ui.answered}
                onBack={ui.back}
                backLabel={view.returnTo === "results" ? "Back to results" : "Back"}
              />
              <SoFarPanel session={session} />
            </div>
          )}

          {resolved.screen === "results" && (
            <ResultsScreen session={session} onEdit={ui.edit} onStartOver={ui.startOver} />
          )}
        </main>

        <footer className="foot">
          <p>
            Built with <a href={REPO_URL}>Factfinch</a>, an open-source plain-language rules engine
            inspired by the IRS Direct File Fact Graph. Not affiliated with the IRS.
          </p>
          <p className="build">
            v{buildInfo.version} · build {buildInfo.build} ·{" "}
            <a href={`${REPO_URL}/commit/${buildInfo.commit}`}>{buildInfo.commit.slice(0, 7)}</a> ·
            rules {graph.rules.id} v{graph.version} ·{" "}
            <a href={`${REPO_URL}/issues/new/choose`}>Report a problem</a>
          </p>
        </footer>
      </div>
    </>
  );
}
