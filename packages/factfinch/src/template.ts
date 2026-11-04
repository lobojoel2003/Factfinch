/**
 * Tiny template language for questions and explanations.
 *
 *   {{/income/wages}}            the fact's value, formatted by its type
 *   {{./name}}                   a fact on the current collection item
 *   {{/eitc/amount|dollar}}      with an explicit format
 *   {{const:ctcPerChild|dollar}} a constant from the rules file
 *   {{item}}                     the current item's display name
 */

const TOKEN = /\{\{\s*([^}|\s]+)\s*(?:\|\s*([a-z]+)\s*)?\}\}/g;

/** Every reference used in a template, e.g. ["/income/wages", "const:x"]. */
export function templateRefs(text: string): string[] {
  return [...text.matchAll(TOKEN)].map((m) => m[1]!);
}

export function renderTemplate(
  text: string,
  lookup: (ref: string, format: string | undefined) => string,
): string {
  return text.replace(TOKEN, (_all, ref: string, format: string | undefined) =>
    lookup(ref, format),
  );
}
