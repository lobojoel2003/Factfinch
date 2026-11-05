/** Progress through the interview's sections. */
export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <nav className="stepper" aria-label="Progress">
      <ol>
        {steps.map((step, i) => {
          const state = i < current ? "done" : i === current ? "current" : "todo";
          return (
            <li
              key={step}
              className={state}
              aria-current={state === "current" ? "step" : undefined}
            >
              <span className="dot" aria-hidden="true">
                {state === "done" ? "✓" : i + 1}
              </span>
              <span className="step-label">
                {step}
                {state === "done" && <span className="sr-only"> (done)</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
