import type { Explanation } from "factfinch";

function tone(node: Explanation): string {
  if (node.kind === "input") return "input";
  if (node.value === true) return "yes";
  if (node.value === false) return "no";
  return "info";
}

function Reason({ node, depth, openAll }: { node: Explanation; depth: number; openAll: boolean }) {
  const sentence = node.text ?? `${node.label}: ${node.display}`;
  const content = (
    <>
      <span className="reason-mark" aria-hidden="true" />
      {node.kind === "input" && <span className="sr-only">You answered: </span>}
      <span>{sentence}</span>
    </>
  );
  if (node.children.length === 0) {
    return (
      <li className={`reason ${tone(node)}`}>
        <div className="reason-row">{content}</div>
      </li>
    );
  }
  return (
    <li className={`reason ${tone(node)}`}>
      <details open={openAll || depth < 1}>
        <summary className="reason-row">
          {content}
          <span className="why" aria-hidden="true">
            why?
          </span>
        </summary>
        <ul>
          {node.children.map((c) => (
            <Reason key={c.path} node={c} depth={depth + 1} openAll={openAll} />
          ))}
        </ul>
      </details>
    </li>
  );
}

/** The reasons behind a result, as an expandable tree. */
export function ReasonTree({
  explanation,
  openAll,
}: {
  explanation: Explanation;
  openAll: boolean;
}) {
  return (
    <ul className="reasons">
      {explanation.children.map((c) => (
        <Reason key={c.path} node={c} depth={0} openAll={openAll} />
      ))}
    </ul>
  );
}
