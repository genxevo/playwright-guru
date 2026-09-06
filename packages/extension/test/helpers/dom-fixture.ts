/**
 * Resets the (happy-dom, global) document's body to `html`.
 *
 * Uses `document.write`, not an `innerHTML` assignment — the repo's lint
 * config forbids `innerHTML`/`outerHTML` assignment everywhere, tests
 * included (see `locator-engine/test/fixtures/dom.ts`, which establishes this
 * exact pattern for the same reason). Unlike a real browser, happy-dom's
 * `document.write` does NOT implicitly reopen the document on a call after the
 * first — it appends (verified directly against happy-dom) — so the previous
 * body's children are removed first, and any elements a prior test appended
 * to `documentElement` outside `<body>` (the picker's highlight host, for
 * instance) are removed too.
 */
export function setBody(html: string): void {
  while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
  for (const el of Array.from(document.documentElement.children)) {
    if (el !== document.head && el !== document.body) el.remove();
  }
  document.write(`<!doctype html><html><body>${html}</body></html>`);
}
