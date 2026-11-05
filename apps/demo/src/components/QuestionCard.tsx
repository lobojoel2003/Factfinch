import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { Question, Session, Value } from "factfinch";
import { ChildrenEditor } from "./ChildrenEditor";
import { friendlyError } from "./errors";

interface Props {
  session: Session;
  question: Question;
  /** Save an answer and move on. Throws FactfinchError for invalid answers. */
  onAnswer: (path: string, value: Value) => void;
  /** The children editor saves its own answers, then calls this. */
  onAnswered: (path: string) => void;
  onBack: () => void;
  backLabel: string;
}

/** One question, rendered for its type. */
export function QuestionCard({
  session,
  question,
  onAnswer,
  onAnswered,
  onBack,
  backLabel,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const takesText = ["dollar", "integer", "number", "string"].includes(question.type);

  // Each question is a fresh card (keyed by path). Text questions focus their
  // input (which is labelled by the question); others focus the question itself
  // so screen readers announce it before the choices.
  useEffect(() => {
    if (!takesText) headingRef.current?.focus();
  }, [takesText]);

  const submit = (value: Value) => {
    try {
      onAnswer(question.path, value);
    } catch (err) {
      setError(friendlyError(err));
    }
  };

  const ids = { heading: `${id}-q`, help: `${id}-help`, error: `${id}-error` };
  const describedBy =
    [question.help && ids.help, error && ids.error].filter(Boolean).join(" ") || undefined;

  let input: ReactNode;
  switch (question.type) {
    case "boolean":
      input = (
        <Choices labelledBy={ids.heading} describedBy={describedBy} columns={2}>
          {[true, false].map((v) => (
            <ChoiceButton
              key={String(v)}
              selected={question.answer === v}
              onClick={() => submit(v)}
            >
              {v ? question.trueLabel : question.falseLabel}
            </ChoiceButton>
          ))}
        </Choices>
      );
      break;
    case "enum":
      input = (
        <Choices labelledBy={ids.heading} describedBy={describedBy}>
          {question.options?.map((o) => (
            <ChoiceButton
              key={o.value}
              selected={question.answer === o.value}
              onClick={() => submit(o.value)}
              help={o.help}
            >
              {o.label}
            </ChoiceButton>
          ))}
        </Choices>
      );
      break;
    case "collection":
      input = (
        <ChildrenEditor
          session={session}
          question={question}
          onDone={() => onAnswered(question.path)}
          onError={setError}
          describedBy={describedBy}
        />
      );
      break;
    default:
      input = (
        <TextAnswer
          question={question}
          labelledBy={ids.heading}
          describedBy={describedBy}
          invalid={!!error}
          onSubmit={submit}
          onError={setError}
        />
      );
  }

  return (
    <section className="card question" aria-labelledby={ids.heading}>
      <p className="eyebrow">
        {question.section ?? "Question"}
        {question.item && <span className="chip">{question.item.label}</span>}
      </p>
      <h1 id={ids.heading} ref={headingRef} tabIndex={-1} className="prompt">
        {question.prompt}
      </h1>
      {question.help && (
        <p className="help" id={ids.help}>
          {question.help}
        </p>
      )}
      {input}
      {error && (
        <p className="error" id={ids.error} role="alert">
          {error}
        </p>
      )}
      <div className="card-foot">
        <button type="button" className="link" onClick={onBack}>
          <span aria-hidden="true">←</span> {backLabel}
        </button>
      </div>
    </section>
  );
}

function Choices({
  children,
  labelledBy,
  describedBy,
  columns,
}: {
  children: ReactNode;
  labelledBy: string;
  describedBy?: string;
  columns?: number;
}) {
  return (
    <div
      className={`choices ${columns === 2 ? "two" : ""}`}
      role="group"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
    >
      {children}
    </div>
  );
}

function ChoiceButton({
  children,
  help,
  selected,
  onClick,
}: {
  children: ReactNode;
  help?: string | undefined;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`choice ${selected ? "selected" : ""}`}
      aria-pressed={selected}
      onClick={onClick}
    >
      <span className="choice-mark" aria-hidden="true" />
      <span className="choice-text">
        <span className="choice-label">{children}</span>
        {help && <span className="choice-help">{help}</span>}
      </span>
    </button>
  );
}

const NUMBER = /^-?(\d+\.?\d*|\.\d+)$/;

function formatTyped(text: string, isDollar: boolean): string {
  const cleaned = text.replace(/[$,\s]/g, "");
  if (!isDollar || !NUMBER.test(cleaned)) return text;
  return Number(cleaned).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function TextAnswer({
  question,
  labelledBy,
  describedBy,
  invalid,
  onSubmit,
  onError,
}: {
  question: Question;
  labelledBy: string;
  describedBy?: string | undefined;
  invalid: boolean;
  onSubmit: (v: Value) => void;
  onError: (e: string) => void;
}) {
  const isDollar = question.type === "dollar";
  const isText = question.type === "string";
  const initial = question.answer === undefined ? "" : String(question.answer);
  const [text, setText] = useState(isText ? initial : formatTyped(initial, isDollar));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (isText) {
      if (!text.trim()) onError("Please enter an answer.");
      else onSubmit(text.trim());
      return;
    }
    const cleaned = text.replace(/[$,\s]/g, "");
    if (!NUMBER.test(cleaned)) {
      onError(
        isDollar
          ? "Please enter an amount in dollars, like 25,000. Enter 0 if none."
          : "Please enter a number.",
      );
      return;
    }
    onSubmit(Number(cleaned));
  };

  return (
    <form className="answer-form" onSubmit={submit} noValidate>
      <div className={`input-wrap ${invalid ? "invalid" : ""}`}>
        {isDollar && (
          <span className="affix" aria-hidden="true">
            $
          </span>
        )}
        <input
          ref={inputRef}
          type="text"
          inputMode={isText ? "text" : question.type === "integer" ? "numeric" : "decimal"}
          autoComplete="off"
          aria-labelledby={labelledBy}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          placeholder={question.placeholder}
          maxLength={question.maxLength}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => !isText && setText((t) => formatTyped(t, isDollar))}
        />
      </div>
      <button type="submit" className="primary">
        Continue
      </button>
    </form>
  );
}
