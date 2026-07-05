/**
 * splitHighlight — highlights a file name without {@html} by splitting it into 3 text nodes.
 * History: the B3 epic pinned down 21 XSS payloads — {@html} is not allowed even with sanitize.
 * Used in ConfirmDialog to emphasize the <b>file name</b> in the message.
 */
export function splitHighlight(
  message: string,
  highlight: string | undefined
): { before: string; match: string; after: string } | null {
  if (!highlight) return null;
  const i = message.indexOf(highlight);
  if (i < 0) return null;
  return {
    before: message.slice(0, i),
    match: highlight,
    after: message.slice(i + highlight.length),
  };
}
