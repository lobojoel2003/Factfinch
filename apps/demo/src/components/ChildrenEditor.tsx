import { useState } from "react";
import type { Question, Session } from "factfinch";

interface Row {
  id?: string;
  name: string;
}

/** Edit a collection: a list of named items (children, here). */
export function ChildrenEditor({
  session,
  question,
  onDone,
  onError,
}: {
  session: Session;
  question: Question;
  onDone: () => void;
  onError: (e: string) => void;
}) {
  const nameField = question.itemName;
  const [rows, setRows] = useState<Row[]>(() =>
    session.items(question.path).map((id) => ({
      id,
      name: nameField ? String(session.answer(`${question.path}/#${id}/${nameField}`) ?? "") : "",
    })),
  );
  const noun = question.itemNoun ?? "item";

  const save = () => {
    if (rows.some((r) => !r.name.trim())) {
      onError(`Please enter a first name for each ${noun}, or remove the empty row.`);
      return;
    }
    const keep = rows.filter((r) => r.id).map((r) => r.id!);
    session.set(question.path, keep);
    for (const row of rows) {
      const name = row.name.trim();
      if (row.id) {
        if (nameField) session.set(`${question.path}/#${row.id}/${nameField}`, name);
      } else {
        session.addItem(question.path, nameField ? { name } : {});
      }
    }
    onDone();
  };

  return (
    <div className="children">
      {rows.length === 0 && <p className="muted">No one added yet.</p>}
      <ul>
        {rows.map((row, i) => (
          <li key={row.id ?? `new-${i}`}>
            <label>
              <span className="sr-only">
                First name of {noun} {i + 1}
              </span>
              <input
                autoFocus={!row.id && i === rows.length - 1}
                placeholder="First name"
                maxLength={60}
                value={row.name}
                onChange={(e) =>
                  setRows(rows.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)))
                }
              />
            </label>
            <button
              type="button"
              className="link danger"
              aria-label={`Remove ${row.name || `${noun} ${i + 1}`}`}
              onClick={() => setRows(rows.filter((_, j) => j !== i))}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <div className="row-actions">
        <button
          type="button"
          className="secondary"
          onClick={() => setRows([...rows, { name: "" }])}
        >
          + {question.addLabel ?? `Add ${noun}`}
        </button>
        <button type="button" className="primary" onClick={save}>
          {rows.length === 0 ? "No one to add — continue" : "Continue"}
        </button>
      </div>
    </div>
  );
}
