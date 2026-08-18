/**
 * Playwright Guru — Rationale copy (WS0).
 * ---------------------------------------------------------------------------
 * THE ONLY PLACE RATIONALE WORDING EXISTS.
 *
 * Domain engines emit codes; this module turns them into English. That split is
 * what makes "Why this locator?" testable, translatable later, and impossible to
 * drift between the Side Panel and the DevTools panel — Phase 0 found the same
 * explanations hand-written in two places and already diverged.
 *
 * ENFORCEMENT MECHANISM E-2
 * The map is declared `satisfies Record<RationaleCode, RationaleCopy>`. Adding a
 * code without copy is a COMPILE ERROR, not a runtime blank. A WS0 test proves
 * the reverse direction too: no orphan entries.
 *
 * Wording here is deliberate but provisional — WS6 refines it against the real
 * Recommended Locator card. The CONTRACT is what WS0 establishes; the prose can
 * improve without touching a single engine.
 */

import type { RationaleCode, RationaleParamValue } from '@playwright-guru/locator-engine';

export type RationaleParams = Readonly<Record<string, RationaleParamValue>>;

export interface RationaleCopy {
  /** Short line shown in the rationale list. */
  title: string;
  /** Optional expansion. A function when it depends on engine parameters. */
  detail?: string | ((params: RationaleParams) => string);
}

const str = (params: RationaleParams, key: string, fallback = ''): string => {
  const value = params[key];
  return value === undefined ? fallback : String(value);
};

const num = (params: RationaleParams, key: string, fallback = 0): number => {
  const value = params[key];
  return typeof value === 'number' ? value : fallback;
};

export const RATIONALE_COPY = {
  // ── Positive ─────────────────────────────────────────────────────────────
  ROLE_BASED: {
    title: 'Role-based',
    detail:
      'Matches how the element is exposed to users and assistive tech, so it survives styling and markup changes.',
  },
  ACCESSIBLE_NAME: {
    title: 'Accessible name',
    detail: (p) => `Identified by the name a user sees: "${str(p, 'name')}".`,
  },
  ASSOCIATED_LABEL: {
    title: 'Associated label',
    detail: (p) => `Found through its <label>: "${str(p, 'label')}".`,
  },
  TEST_ID: {
    title: 'Test ID',
    detail: 'Uses a dedicated test attribute — the most stable contract a team can offer.',
  },
  UNIQUE_VISIBLE: {
    title: 'Matches exactly one visible element',
    detail: 'Verified against the page as it is right now.',
  },
  USER_FACING: {
    title: 'User-facing',
    detail: 'Built from something a person can actually see, not from internal markup.',
  },
  SEMANTIC_HTML: {
    title: 'Semantic HTML',
    detail: 'The element carries real meaning, so its role is stable.',
  },

  // ── Structural ───────────────────────────────────────────────────────────
  SCOPED_BY_ANCESTOR: {
    title: 'Scoped to a parent',
    detail: (p) => {
      const role = str(p, 'ancestorRole', 'container');
      const name = str(p, 'ancestorName');
      const siblings = num(p, 'siblingMatches');
      const where = name ? `the ${role} "${name}"` : `its ${role}`;
      return siblings > 1
        ? `${siblings} elements on the page share this name; scoping to ${where} makes this one unambiguous.`
        : `Scoped to ${where} to keep the match unambiguous.`;
    },
  },
  NTH_REQUIRED: {
    title: 'Position-based',
    detail: (p) => {
      const count = num(p, 'matchCount');
      return `${count} elements match and no unique parent container was found. .nth() depends on element order — it will break if the list is reordered or filtered. Consider asking your team for a data-testid.`;
    },
  },
  INSIDE_IFRAME: {
    title: 'Inside an iframe',
    detail:
      'This element lives in a nested document, so Playwright needs frameLocator() to reach it.',
  },

  // ── Cautions ─────────────────────────────────────────────────────────────
  AMBIGUOUS_MATCHES: {
    title: 'Matches more than one element',
    detail: (p) =>
      `${num(p, 'count')} visible elements match. Scope it to a parent, or add a more specific attribute.`,
  },
  NO_MATCH: {
    title: 'Matches nothing',
    detail: 'The element may be hidden, inside an iframe, or not rendered yet.',
  },
  TEXT_TRUNCATED: {
    title: 'Text too long to match on',
    detail:
      'This element’s text exceeds the length we can match reliably, so exact-text locators are not offered.',
  },
  DYNAMIC_ATTRIBUTE: {
    title: 'Looks generated',
    detail: (p) => {
      const attr = str(p, 'attribute', 'value');
      return `This ${attr} looks framework-generated and will change on the next build. A partial match is offered instead.`;
    },
  },
  STYLING_CLASS: {
    title: 'Styling class',
    detail:
      'Utility classes describe appearance, not identity — they change whenever the design does.',
  },
  POSITIONAL: {
    title: 'Depends on position',
    detail: 'Relies on where the element sits, so reordering the page breaks it.',
  },
  DEEP_STRUCTURE: {
    title: 'Depends on deep structure',
    detail: 'Tied to several levels of markup, any of which could change.',
  },
  NOT_USER_FACING: {
    title: 'Not user-facing',
    detail: 'Built from internal markup rather than anything a person can see.',
  },
  SHADOW_DOM_UNSUPPORTED: {
    title: 'Inside a shadow root',
    detail: 'This element lives in a web component’s shadow DOM, which is not supported yet.',
  },

  // ── Absence (drives the teaching rows) ───────────────────────────────────
  NO_ROLE: {
    title: 'No ARIA role',
    detail: 'Use semantic HTML such as <button>, <a> or <select>, or add an explicit role.',
  },
  NO_LABEL: {
    title: 'No label',
    detail: 'Add <label for="…"> or wrap the control in a <label>.',
  },
  NO_PLACEHOLDER: {
    title: 'No placeholder',
    detail: 'Only available on <input> and <textarea>.',
  },
  NO_TEXT: {
    title: 'No visible text',
    detail: 'For interactive elements, prefer getByRole with an accessible name.',
  },
  NO_ALT: {
    title: 'No alt attribute',
    detail: 'Applies to <img> and <input type="image">.',
  },
  NO_TITLE: {
    title: 'No title attribute',
    detail: 'Note that title is poorly supported by assistive technology.',
  },
  NO_TEST_ID: {
    title: 'No data-testid',
    detail: 'Consider adding one — it is the most stable locator available.',
  },
} satisfies Record<RationaleCode, RationaleCopy>;

/** Resolves a rationale to displayable text. The only renderer of engine codes. */
export function resolveRationaleCopy(
  code: RationaleCode,
  params?: RationaleParams,
): { title: string; detail?: string } {
  const entry: RationaleCopy = RATIONALE_COPY[code];
  const detail = typeof entry.detail === 'function' ? entry.detail(params ?? {}) : entry.detail;
  return detail === undefined ? { title: entry.title } : { title: entry.title, detail };
}
