/**
 * Playwright action suffixes — shared codegen helper (WS2 item 3).
 *
 * Extracted verbatim from `SidePanel.tsx` and `Panel.tsx`, which each carried
 * an identical copy of this table + `applyAction`. It supports the `AddButton`
 * primitive and is imported by both panels; behaviour is unchanged.
 */
import type { TargetLanguage } from '@playwright-guru/codegen';

/** Per-action call suffix, indexed `[js, python, java, csharp]`. */
export const ACTION_MAP: Record<string, [string, string, string, string]> = {
  click: ['.click()', '.click()', '.click()', '.ClickAsync()'],
  fill: [".fill('')", '.fill("")', '.fill("")', '.FillAsync("")'],
  clear: ['.clear()', '.clear()', '.clear()', '.ClearAsync()'],
  check: ['.check()', '.check()', '.check()', '.CheckAsync()'],
  uncheck: ['.uncheck()', '.uncheck()', '.uncheck()', '.UncheckAsync()'],
  selectOption: [
    ".selectOption('')",
    '.select_option("")',
    '.selectOption("")',
    '.SelectOptionAsync("")',
  ],
  hover: ['.hover()', '.hover()', '.hover()', '.HoverAsync()'],
  press: [".press('Enter')", '.press("Enter")', '.press("Enter")', '.PressAsync("Enter")'],
  waitFor: ['.waitFor()', '.wait_for()', '.waitFor()', '.WaitForAsync()'],
  dblclick: ['.dblclick()', '.dblclick()', '.dblclick()', '.DblClickAsync()'],
};

/** Append the language-appropriate action call (and `await`) to a locator. */
export function applyAction(code: string, action: string, lang: TargetLanguage): string {
  if (action === 'none') return code;
  const row = ACTION_MAP[action];
  if (!row) return code;
  const isCS = lang.startsWith('csharp'),
    isPy = lang.startsWith('python'),
    isJav = lang === 'java';
  const suffix = isCS ? row[3] : isPy ? row[1] : isJav ? row[2] : row[0];
  return `${!isJav && lang !== 'python_sync' ? 'await ' : ''}${code}${suffix}`;
}
