/**
 * WS5 — the seven getBy* kinds and the five languages, declared once.
 *
 * D-a (DL-67): the two panels carried different `naReason` copy for six of the
 * seven kinds. The Side Panel told a user what to DO about it — "add
 * `<label for="...">` or wrap element in `<label>`" — while DevTools said only
 * "No `<label>` associated." Nothing made that a decision; it is drift. The
 * owner resolved it (O4) in favour of the fuller copy for both surfaces, so
 * these strings are the Side Panel's, moved verbatim.
 *
 * `naReason` is the ABSENT-attribute fallback. When the attribute exists but
 * produced nothing, `naReasonFor()` says that instead — see `copy/na-reason.ts`.
 */
import type { ActionOption, PwLang } from './types';

export interface GetByKind {
  readonly kind: 'role' | 'label' | 'placeholder' | 'text' | 'altText' | 'title' | 'testId';
  readonly label: string;
  readonly color: string;
  readonly naReason: string;
}

export const ALL_GETBY_KINDS: readonly GetByKind[] = [
  {
    kind: 'role',
    label: 'getByRole',
    color: '#16a34a',
    naReason: 'No ARIA role detected — try semantic HTML like <button>, <a>, <select>.',
  },
  {
    kind: 'label',
    label: 'getByLabel',
    color: '#16a34a',
    naReason: 'No <label> found — add <label for="..."> or wrap element in <label>.',
  },
  {
    kind: 'placeholder',
    label: 'getByPlaceholder',
    color: '#2563eb',
    naReason: 'No placeholder attribute — only available on <input> and <textarea>.',
  },
  { kind: 'text', label: 'getByText', color: '#2563eb', naReason: 'No visible text to match on.' },
  {
    kind: 'altText',
    label: 'getByAltText',
    color: '#7c3aed',
    naReason: 'No alt attribute — only applies to <img> and <input type="image">.',
  },
  {
    kind: 'title',
    label: 'getByTitle',
    color: '#6b7280',
    naReason: 'No title attribute. Note: title is poorly supported by assistive tech.',
  },
  {
    kind: 'testId',
    label: 'getByTestId',
    color: '#d97706',
    naReason: "No data-testid found. ★ Consider adding one — it's the most stable locator.",
  },
];

/** The five target languages, identical in both panels before WS5. */
export const LANGS: ReadonlyArray<{ label: string; value: PwLang }> = [
  { label: 'TypeScript', value: 'typescript' },
  { label: 'JavaScript', value: 'javascript' },
  { label: 'Python', value: 'python_sync' }, // sync = cleaner code, no await confusion
  { label: 'Java', value: 'java' },
  { label: 'C#', value: 'csharp_async' }, // Playwright .NET is always async
];

/** The always-first, always-hint-free entry of the action dropdown. */
export const NO_ACTION: ActionOption = { label: 'No action', value: 'none', hint: '' };
