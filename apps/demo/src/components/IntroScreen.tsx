import type { Value } from "factfinch";
import { examples, graph } from "../rules";
import { ConfirmButton } from "./ConfirmButton";

const POINTS = [
  ["Plain questions", "No tax forms, no jargon. Help is there when a word is unclear."],
  ["Only what's needed", "Questions that can't change your result are skipped."],
  ["Every result explained", "See exactly which rule decided each amount, and why."],
  ["Stays on your device", "Nothing you enter is sent anywhere. Clear it any time."],
] as const;

export function IntroScreen({
  hasProgress,
  onStart,
  onStartOver,
  onExample,
}: {
  hasProgress: boolean;
  onStart: () => void;
  onStartOver: () => void;
  onExample: (answers: Record<string, Value>) => void;
}) {
  return (
    <section className="card intro" aria-labelledby="intro-title">
      <p className="eyebrow">Free · private · about 5 minutes</p>
      <h1 id="intro-title">
        See if you can get the <em>Earned Income Tax Credit</em> and the <em>Child Tax Credit</em>
      </h1>
      <p className="lede">{graph.rules.description}</p>

      <ul className="points">
        {POINTS.map(([title, text]) => (
          <li key={title}>
            <strong>{title}.</strong> {text}
          </li>
        ))}
      </ul>

      <div className="actions">
        <button type="button" className="primary big" onClick={onStart}>
          {hasProgress ? "Continue where you left off" : "Start"}
        </button>
        {hasProgress && (
          <ConfirmButton
            label="Start over"
            question="Clear all your answers?"
            confirmLabel="Yes, clear them"
            onConfirm={onStartOver}
          />
        )}
      </div>

      {examples.length > 0 && (
        <div className="examples">
          <h2 className="h3">Or see an example household</h2>
          <ul>
            {examples.map((ex) => (
              <li key={ex.name}>
                <button type="button" className="example" onClick={() => onExample(ex.answers)}>
                  {ex.name}
                  <span aria-hidden="true"> →</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="disclaimer">{graph.rules.disclaimer}</p>
    </section>
  );
}
