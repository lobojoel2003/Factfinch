import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Question, Session } from "factfinch";
import { friendlyError } from "./errors";

interface Row {
  /** Set for items already in the session. */
  id?: string;
  name: string;
  key: number;
}

/** Add, rename and remove the items of a collection (children, here). */
export function ChildrenEditor({
  session,
  question,
  onDone,
  onError,
  describedBy,
}: {
  session: Session;
  question: Question;
  onDone: () => void;
  onError: (e: string) => void;
  describedBy?: string | undefined;
}) {
  const nameField = question.itemName;
  const noun = question.itemNoun ?? "item";
  const nextKey = useRef(0);
  const [rows, setRows] = useState<Row[]>(() =>
    session.items(question.path).map((id) => ({
      id,
      key: nextKey.current++,
      name: nameField ? String(session.answer(`${question.path}/#${id}/${nameField}`) ?? "") : "",
    })),
  );
  const inputs = useRef(new Map<number, HTMLInputElement>());
  const [focusKey, setFocusKey] = useState<number | null>(null);

  useEffect(() => {
    if (focusKey !== null) inputs.current.get(focusKey)?.focus();
  }, [focusKey]);

  const add = () => {
    const key = nextKey.current++;
    setRows((r) => [...r, { key, name: "" }]);
    setFocusKey(key);
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    const names = rows.map((r) => r.name.trim());
    if (names.some((n) => !n)) {
      onError(`Please enter a first name for each ${noun}, or remove the empty row.`);
      return;
    }
    const lower = names.map((n) => n.toLowerCase());
    const dupe = names.find((_, i) => lower.indexOf(lower[i]!) !== i);
    if (dupe) {
      onError(
        `Two entries are named ${dupe}. Add a last initial so the questions can tell them apart.`,
      );
      return;
    }
    try {
      session.batch(() => {
        session.set(
          question.path,
          rows.flatMap((r) => (r.id ? [r.id] : [])),
        );
        for (const row of rows) {
          const name = row.name.trim();
          if (!row.id) session.addItem(question.path, nameField ? { name } : {});
          else if (nameField) session.set(`${question.path}/#${row.id}/${nameField}`, name);
        }
      });
      onDone();
    } catch (err) {
      onError(friendlyError(err));
    }
  };

  return (
    <form className="children" onSubmit={save} noValidate aria-describedby={describedBy}>
      {rows.length === 0 ? (
        <p className="empty">No one added yet.</p>
      ) : (
        <ol>
          {rows.map((row, i) => (
            <li key={row.key}>
              <span className="row-number" aria-hidden="true">
                {i + 1}
              </span>
              <label className="input-wrap">
                <span className="sr-only">
                  First name of {noun} {i + 1}
                </span>
                <input
                  ref={(el) => {
                    if (el) inputs.current.set(row.key, el);
                    else inputs.current.delete(row.key);
                  }}
                  autoComplete="off"
                  placeholder="First name"
                  maxLength={60}
                  value={row.name}
                  onChange={(e) =>
                    setRows((r) =>
                      r.map((x) => (x.key === row.key ? { ...x, name: e.target.value } : x)),
                    )
                  }
                />
              </label>
              <button
                type="button"
                className="link danger"
                onClick={() => setRows((r) => r.filter((x) => x.key !== row.key))}
              >
                Remove<span className="sr-only"> {row.name || `${noun} ${i + 1}`}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
      <div className="actions">
        <button type="button" className="secondary" onClick={add}>
          <span aria-hidden="true">+</span> {question.addLabel ?? `Add ${noun}`}
        </button>
        <button type="submit" className="primary">
          {rows.length === 0 ? "No one to add — continue" : "Continue"}
        </button>
      </div>
    </form>
  );
}
