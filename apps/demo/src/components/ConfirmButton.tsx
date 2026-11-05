import { useEffect, useRef, useState } from "react";

/** A button for destructive actions: it asks once more before acting. */
export function ConfirmButton({
  label,
  question,
  confirmLabel,
  onConfirm,
}: {
  label: string;
  question: string;
  confirmLabel: string;
  onConfirm: () => void;
}) {
  const [asking, setAsking] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const openRef = useRef<HTMLButtonElement>(null);
  const wasAsking = useRef(false);

  useEffect(() => {
    if (asking) confirmRef.current?.focus();
    else if (wasAsking.current) openRef.current?.focus();
    wasAsking.current = asking;
  }, [asking]);

  if (!asking) {
    return (
      <button ref={openRef} type="button" className="link danger" onClick={() => setAsking(true)}>
        {label}
      </button>
    );
  }
  return (
    <span className="confirm" role="group" aria-label={question}>
      <span className="confirm-question">{question}</span>
      <button ref={confirmRef} type="button" className="danger-button" onClick={onConfirm}>
        {confirmLabel}
      </button>
      <button type="button" className="link" onClick={() => setAsking(false)}>
        Cancel
      </button>
    </span>
  );
}
