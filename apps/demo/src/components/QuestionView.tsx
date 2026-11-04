import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { FactfinchError, type Question, type Session, type Value } from "factfinch";
import { ChildrenEditor } from "./ChildrenEditor";

interface Props {
  session: Session;
  question: Question;
  onAnswered: () => void;
  onBack: () => void;
}

/** One question, rendered for its type. */
export function QuestionView({ session, question, onAnswered, onBack }: Props) {
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const helpId = useId();

  // Move focus to each new question so screen readers announce it.
  useEffect(() => {
    setError(null);
    headingRef.current?.focus();
  }, [question.path]);

  const submit = (value: Value) => {
    try {
      session.set(question.path, value);
      setError(null);
      onAnswered();
    } catch (err) {
      setError(err instanceof FactfinchError ? friendly(err.message) : String(err));
    }
  };

  return (
    <section className="card question" aria-labelledby={`${helpId}-q`}>
      {question.section && (
        <p className="eyebrow">
          {question.section}
          {question.item ? ` · ${question.item.label}` : ""}
        </p>
      )}
      <h2 id={`${helpId}-q`} ref={headingRef} tabIndex={-1}>
        {question.prompt}
      </h2>
      {question.help && (
        <p className="help" id={helpId}>
          {question.help}
        </p>
      )}

      {question.type === "boolean" && <BooleanInput question={question} onSubmit={submit} />}
      {question.type === "enum" && (
        <EnumInput question={question} onSubmit={submit} helpId={helpId} />
      )}
      {(question.type === "dollar" ||
        question.type === "integer" ||
        question.type === "number") && (
        <NumberInput question={question} onSubmit={submit} onError={setError} helpId={helpId} />
      )}
      {question.type === "string" && (
        <TextInput question={question} onSubmit={submit} onError={setError} />
      )}
      {question.type === "collection" && (
        <ChildrenEditor
          session={session}
          question={question}
          onDone={onAnswered}
          onError={setError}
        />
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="nav">
        <button type="button" className="link" onClick={onBack}>
          ← Back
        </button>
      </div>
    </section>
  );
}

function friendly(message: string): string {
  return message.replace(/\s*\(\/[^)]*\)$/, "");
}

function BooleanInput({
  question,
  onSubmit,
}: {
  question: Question;
  onSubmit: (v: boolean) => void;
}) {
  return (
    <div className="choices two">
      {[true, false].map((v) => (
        <button
          key={String(v)}
          type="button"
          className={`choice ${question.answer === v ? "selected" : ""}`}
          aria-pressed={question.answer === v}
          onClick={() => onSubmit(v)}
        >
          {v ? question.trueLabel : question.falseLabel}
        </button>
      ))}
    </div>
  );
}

function EnumInput({
  question,
  onSubmit,
  helpId,
}: {
  question: Question;
  onSubmit: (v: string) => void;
  helpId: string;
}) {
  return (
    <div className="choices" role="group" aria-describedby={question.help ? helpId : undefined}>
      {question.options?.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`choice option ${question.answer === o.value ? "selected" : ""}`}
          aria-pressed={question.answer === o.value}
          onClick={() => onSubmit(o.value)}
        >
          <span className="option-label">{o.label}</span>
          {o.help && <span className="option-help">{o.help}</span>}
        </button>
      ))}
    </div>
  );
}

function NumberInput({
  question,
  onSubmit,
  onError,
  helpId,
}: {
  question: Question;
  onSubmit: (v: number) => void;
  onError: (e: string) => void;
  helpId: string;
}) {
  const [text, setText] = useState(question.answer === undefined ? "" : String(question.answer));
  const isDollar = question.type === "dollar";
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const cleaned = text.replace(/[$,\s]/g, "");
    if (cleaned === "" || !/^-?\d*\.?\d+$/.test(cleaned)) {
      onError(
        isDollar ? "Please enter an amount in dollars, like 25000." : "Please enter a number.",
      );
      return;
    }
    onSubmit(Number(cleaned));
  };
  return (
    <form className="answer-form" onSubmit={submit}>
      <div className={`input-wrap ${isDollar ? "dollar" : ""}`}>
        {isDollar && <span aria-hidden="true">$</span>}
        <input
          autoFocus
          inputMode={question.type === "integer" ? "numeric" : "decimal"}
          aria-label={question.prompt}
          aria-describedby={question.help ? helpId : undefined}
          placeholder={question.placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      <button type="submit" className="primary">
        Continue
      </button>
    </form>
  );
}

function TextInput({
  question,
  onSubmit,
  onError,
}: {
  question: Question;
  onSubmit: (v: string) => void;
  onError: (e: string) => void;
}) {
  const [text, setText] = useState(typeof question.answer === "string" ? question.answer : "");
  return (
    <form
      className="answer-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) onError("Please enter an answer.");
        else onSubmit(text.trim());
      }}
    >
      <div className="input-wrap">
        <input
          autoFocus
          aria-label={question.prompt}
          placeholder={question.placeholder}
          maxLength={question.maxLength}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      <button type="submit" className="primary">
        Continue
      </button>
    </form>
  );
}
