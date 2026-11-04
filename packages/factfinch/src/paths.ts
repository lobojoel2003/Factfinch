/**
 * Path helpers.
 *
 * Definition paths use `*` for "any item": `/children/*\/age`.
 * Concrete paths name one item with `#id`:  `/children/#c1/age`.
 * Inside a collection item, `./age` refers to the same item's `age` fact.
 */

const ITEM_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function isValidItemId(id: string): boolean {
  return ITEM_ID.test(id);
}

export function segments(path: string): string[] {
  return path.split("/").filter((s) => s.length > 0);
}

export function isAbsolute(path: string): boolean {
  return path.startsWith("/");
}

/** `/children/#c1/age` -> `/children/*\/age` */
export function toDefinitionPath(path: string): string {
  return (
    "/" +
    segments(path)
      .map((s) => (s.startsWith("#") ? "*" : s))
      .join("/")
  );
}

/** `/children/#c1/age` -> `/children/#c1`; top-level paths -> undefined */
export function itemContextOf(path: string): string | undefined {
  const segs = segments(path);
  for (let i = segs.length - 1; i >= 0; i--) {
    if (segs[i]!.startsWith("#") || segs[i] === "*") return "/" + segs.slice(0, i + 1).join("/");
  }
  return undefined;
}

/** `/children/#c1` -> `{ collection: "/children", id: "c1" }` */
export function splitItem(itemContext: string): { collection: string; id: string } {
  const segs = segments(itemContext);
  const last = segs[segs.length - 1] ?? "";
  return { collection: "/" + segs.slice(0, -1).join("/"), id: last.replace(/^#/, "") };
}

export function itemPath(collection: string, id: string): string {
  return `${collection}/#${id}`;
}

/**
 * Every item segment in a concrete path, outermost first:
 * `/a/#x/b/#y/c` -> [{collection:"/a", id:"x"}, {collection:"/a/#x/b", id:"y"}]
 */
export function itemsInPath(path: string): { collection: string; id: string }[] {
  const segs = segments(path);
  const out: { collection: string; id: string }[] = [];
  segs.forEach((s, i) => {
    if (s.startsWith("#"))
      out.push({ collection: "/" + segs.slice(0, i).join("/"), id: s.slice(1) });
  });
  return out;
}

/**
 * Resolve a reference against an item context. Returns undefined when a
 * relative reference is used outside of any item.
 */
export function resolveRef(ref: string, itemContext: string | undefined): string | undefined {
  if (isAbsolute(ref)) return ref;
  if (ref.startsWith("./")) {
    if (!itemContext) return undefined;
    return `${itemContext}/${ref.slice(2)}`;
  }
  return undefined;
}
