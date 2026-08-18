/**
 * Playwright Guru — Comprehensive CSS & XPath generator.
 * Generates categorized selector variants for the sub-tab card UI.
 */

import type { ElementAttributes } from '@playwright-guru/locator-engine';
import type { TargetLanguage } from '@playwright-guru/codegen';

// ─── Escape helpers ─────────────────────────────────────────────────────────
function ec(s: string): string { try { return CSS.escape(s); } catch { return s.replace(/([^\w-])/g, '\\$1'); } }
function ea(s: string): string { return s.replace(/"/g, '\\"'); }

// ─── Sub-tab types ──────────────────────────────────────────────────────────
export type CSSSubTab   = 'core' | 'attributes' | 'regex' | 'logical' | 'pseudo' | 'hierarchical';
export type XPathSubTab = 'core' | 'logical' | 'partial' | 'text' | 'indexing' | 'axes';

export const CSS_SUB_TABS: Array<{ id: CSSSubTab; label: string }> = [
  { id: 'core',         label: 'Core'         },
  { id: 'attributes',  label: 'Attributes'   },
  { id: 'regex',       label: 'Regex'        },
  { id: 'logical',     label: 'Logical'      },
  { id: 'pseudo',      label: 'Pseudo'       },
  { id: 'hierarchical',label: 'Hierarchical' },
];

export const XPATH_SUB_TABS: Array<{ id: XPathSubTab; label: string }> = [
  { id: 'core',     label: 'Core'       },
  { id: 'logical',  label: 'Logical'    },
  { id: 'partial',  label: 'Partial'    },
  { id: 'text',     label: 'Text-Based' },
  { id: 'indexing', label: 'Indexing'   },
  { id: 'axes',     label: 'Axes'       },
];

// ─── Variant interfaces ──────────────────────────────────────────────────────
export interface CSSVariant {
  selector:    string;
  description: string;
  subTab:      CSSSubTab;
  reliability: 'high' | 'medium' | 'low';
  /** Kept for backward compat with reliability badge colour mapping */
  category:    string;
}

export interface XPathVariant {
  xpath:       string;
  description: string;
  subTab:      XPathSubTab;
  reliability: 'high' | 'medium' | 'low';
}

export const RELIABILITY_COLORS: Record<CSSVariant['reliability'], { bg: string; text: string; label: string }> = {
  high:   { bg: '#dcfce7', text: '#166534', label: '✓ High'   },
  medium: { bg: '#fef3c7', text: '#854d0e', label: '⚡ Medium' },
  low:    { bg: '#fee2e2', text: '#991b1b', label: '⚠ Low'    },
};

// ─── CSS variant generator ───────────────────────────────────────────────────
export function generateAllCSSVariants(attrs: ElementAttributes): CSSVariant[] {
  const v: CSSVariant[] = [];
  const tag = attrs.tagName.toLowerCase();

  // ── CORE: id, class, basic tag ─────────────────────────────────────────
  if (attrs.id) {
    v.push({ selector: `#${ec(attrs.id)}`,                          description: 'ID only — shortest form',          subTab: 'core', category: 'id', reliability: 'high' });
    v.push({ selector: `${tag}#${ec(attrs.id)}`,                    description: `${tag} tag + ID`,                  subTab: 'core', category: 'id', reliability: 'high' });
    v.push({ selector: `*#${ec(attrs.id)}`,                         description: 'Any tag with this ID',             subTab: 'core', category: 'id', reliability: 'high' });
    v.push({ selector: `[id="${ea(attrs.id)}"]`,                    description: 'ID as attribute selector',         subTab: 'core', category: 'id', reliability: 'high' });
    v.push({ selector: `${tag}[id="${ea(attrs.id)}"]`,              description: `${tag}[id] explicit form`,         subTab: 'core', category: 'id', reliability: 'high' });
  }
  if (attrs.className) {
    const cls = attrs.className.split(/\s+/).filter(Boolean);
    if (cls.length >= 1) {
      v.push({ selector: `.${ec(cls[0])}`,                          description: `Class "${cls[0]}" only`,          subTab: 'core', category: 'class', reliability: 'low' });
      v.push({ selector: `${tag}.${ec(cls[0])}`,                   description: `${tag} + class "${cls[0]}"`,      subTab: 'core', category: 'class', reliability: 'low' });
      v.push({ selector: `*.${ec(cls[0])}`,                         description: `Any tag with class`,              subTab: 'core', category: 'class', reliability: 'low' });
      v.push({ selector: `[class="${ea(attrs.className.trim())}"]`, description: 'Exact class list match',          subTab: 'core', category: 'class', reliability: 'low' });
    }
    if (cls.length >= 2) {
      v.push({ selector: `${tag}.${ec(cls[0])}.${ec(cls[1])}`,     description: `${tag} with 2 classes`,           subTab: 'core', category: 'class', reliability: 'medium' });
    }
    if (cls.length >= 3) {
      v.push({ selector: `${tag}.${ec(cls[0])}.${ec(cls[1])}.${ec(cls[2])}`, description: `${tag} with 3 classes`, subTab: 'core', category: 'class', reliability: 'medium' });
    }
  }

  // ── ATTRIBUTES ─────────────────────────────────────────────────────────
  if (attrs.name) {
    const n = attrs.name;
    v.push({ selector: `[name="${ea(n)}"]`,                         description: 'name attribute',                  subTab: 'attributes', category: 'attribute', reliability: 'medium' });
    v.push({ selector: `${tag}[name="${ea(n)}"]`,                  description: `${tag} + name`,                   subTab: 'attributes', category: 'attribute', reliability: 'high'   });
    if (attrs.id)  v.push({ selector: `${tag}#${ec(attrs.id)}[name="${ea(n)}"]`, description: 'ID + name combo', subTab: 'attributes', category: 'combination', reliability: 'high' });
  }
  if (attrs.placeholder) {
    const p = attrs.placeholder;
    v.push({ selector: `[placeholder="${ea(p)}"]`,                  description: 'placeholder attribute',           subTab: 'attributes', category: 'attribute', reliability: 'medium' });
    v.push({ selector: `${tag}[placeholder="${ea(p)}"]`,           description: `${tag} + placeholder`,            subTab: 'attributes', category: 'attribute', reliability: 'high'   });
  }
  if (attrs.ariaLabel) {
    const a = attrs.ariaLabel;
    v.push({ selector: `[aria-label="${ea(a)}"]`,                   description: 'ARIA label attribute',            subTab: 'attributes', category: 'attribute', reliability: 'high'   });
    v.push({ selector: `${tag}[aria-label="${ea(a)}"]`,            description: `${tag} + ARIA label`,             subTab: 'attributes', category: 'attribute', reliability: 'high'   });
  }
  if (attrs.alt) {
    v.push({ selector: `[alt="${ea(attrs.alt)}"]`,                  description: 'alt text attribute',              subTab: 'attributes', category: 'attribute', reliability: 'medium' });
    v.push({ selector: `${tag}[alt="${ea(attrs.alt)}"]`,           description: `${tag} + alt`,                    subTab: 'attributes', category: 'attribute', reliability: 'high'   });
  }
  if (attrs.title) {
    v.push({ selector: `[title="${ea(attrs.title)}"]`,              description: 'title attribute',                 subTab: 'attributes', category: 'attribute', reliability: 'medium' });
    v.push({ selector: `${tag}[title="${ea(attrs.title)}"]`,       description: `${tag} + title`,                  subTab: 'attributes', category: 'attribute', reliability: 'medium' });
  }
  if (attrs.testId) {
    v.push({ selector: `[data-testid="${ea(attrs.testId)}"]`,       description: 'data-testid (recommended)',       subTab: 'attributes', category: 'attribute', reliability: 'high'   });
    v.push({ selector: `${tag}[data-testid="${ea(attrs.testId)}"]`,description: `${tag} + data-testid`,            subTab: 'attributes', category: 'attribute', reliability: 'high'   });
  }
  if (attrs.type) {
    v.push({ selector: `${tag}[type="${attrs.type}"]`,              description: `${tag}[type="${attrs.type}"]`,   subTab: 'attributes', category: 'type', reliability: 'low'    });
    v.push({ selector: `[type="${attrs.type}"]`,                    description: `type="${attrs.type}" only`,       subTab: 'attributes', category: 'type', reliability: 'low'    });
    if (attrs.name) v.push({ selector: `${tag}[type="${attrs.type}"][name="${ea(attrs.name)}"]`, description: 'type + name', subTab: 'attributes', category: 'combination', reliability: 'high' });
    if (attrs.placeholder) v.push({ selector: `${tag}[type="${attrs.type}"][placeholder="${ea(attrs.placeholder)}"]`, description: 'type + placeholder', subTab: 'attributes', category: 'combination', reliability: 'high' });
    if (attrs.id) v.push({ selector: `${tag}[type="${attrs.type}"]#${ec(attrs.id)}`, description: 'type + ID', subTab: 'attributes', category: 'combination', reliability: 'high' });
  }
  if (attrs.href) {
    try {
      const url = new URL(attrs.href); const path = url.pathname;
      v.push({ selector: `a[href="${ea(attrs.href)}"]`,             description: 'exact href',                      subTab: 'attributes', category: 'attribute', reliability: 'medium' });
      v.push({ selector: `a[href*="${ea(path)}"]`,                  description: `href contains path "${path}"`,    subTab: 'attributes', category: 'attribute', reliability: 'medium' });
    } catch { v.push({ selector: `a[href="${ea(attrs.href)}"]`, description: 'href exact', subTab: 'attributes', category: 'attribute', reliability: 'medium' }); }
  }

  // ── REGEX (dynamic attribute matching ^= *= $=) ─────────────────────────
  if (attrs.id && attrs.id.length >= 4) {
    const pre = attrs.id.slice(0, 3), mid = attrs.id.length > 6 ? attrs.id.slice(2, -2) : attrs.id.slice(1, -1), suf = attrs.id.slice(-3);
    v.push({ selector: `[id^="${ea(pre)}"]`,          description: `ID starts with "${pre}"`,      subTab: 'regex', category: 'dynamic', reliability: 'medium' });
    if (mid && mid !== pre && mid !== suf) v.push({ selector: `[id*="${ea(mid)}"]`, description: `ID contains "${mid}"`, subTab: 'regex', category: 'dynamic', reliability: 'medium' });
    v.push({ selector: `[id$="${ea(suf)}"]`,          description: `ID ends with "${suf}"`,        subTab: 'regex', category: 'dynamic', reliability: 'medium' });
    v.push({ selector: `${tag}[id^="${ea(pre)}"]`,   description: `${tag} + ID starts with`,      subTab: 'regex', category: 'dynamic', reliability: 'medium' });
  }
  if (attrs.name && attrs.name.length >= 3) {
    const pre = attrs.name.slice(0, 3); const suf = attrs.name.slice(-2);
    v.push({ selector: `[name^="${ea(pre)}"]`,        description: `name starts with "${pre}"`,    subTab: 'regex', category: 'dynamic', reliability: 'medium' });
    v.push({ selector: `[name*="${ea(attrs.name.slice(1, -1))}"]`, description: `name contains substring`, subTab: 'regex', category: 'dynamic', reliability: 'medium' });
    v.push({ selector: `[name$="${ea(suf)}"]`,        description: `name ends with "${suf}"`,      subTab: 'regex', category: 'dynamic', reliability: 'medium' });
  }
  if (attrs.placeholder) {
    const first = attrs.placeholder.split(' ')[0];
    v.push({ selector: `[placeholder^="${ea(first)}"]`, description: `placeholder starts with "${first}"`, subTab: 'regex', category: 'dynamic', reliability: 'medium' });
    v.push({ selector: `[placeholder*="${ea(attrs.placeholder.slice(0, 6))}"]`, description: 'placeholder contains substring', subTab: 'regex', category: 'dynamic', reliability: 'medium' });
  }
  if (attrs.className) {
    const cls = attrs.className.split(/\s+/)[0];
    if (cls && cls.length >= 4) v.push({ selector: `[class*="${ea(cls.slice(1, -1))}"]`, description: `class contains "${cls.slice(1,-1)}"`, subTab: 'regex', category: 'dynamic', reliability: 'low' });
  }
  if (attrs.href) {
    try { const url = new URL(attrs.href); v.push({ selector: `a[href$="${ea(url.pathname)}"]`, description: `href ends with pathname`, subTab: 'regex', category: 'dynamic', reliability: 'medium' }); } catch { /* skip */ }
  }

  // ── LOGICAL (:not, multi-attribute exclusions) ──────────────────────────
  if (attrs.id && attrs.className) {
    const cls = attrs.className.split(/\s+/)[0];
    if (cls) {
      v.push({ selector: `${tag}:not(#${ec(attrs.id)})`,    description: `Exclude element by ID`,             subTab: 'logical', category: 'logical', reliability: 'low'    });
      v.push({ selector: `${tag}:not(.${ec(cls)})`,         description: `Exclude class "${cls}"`,            subTab: 'logical', category: 'logical', reliability: 'low'    });
      v.push({ selector: `${tag}:not(#${ec(attrs.id)}):not(.${ec(cls)})`, description: 'Chained negation: ID and class', subTab: 'logical', category: 'logical', reliability: 'low' });
    }
  }
  if (attrs.id) {
    v.push({ selector: `#${ec(attrs.id)}:not([disabled])`,  description: 'ID element — exclude disabled',     subTab: 'logical', category: 'logical', reliability: 'high'   });
    v.push({ selector: `#${ec(attrs.id)}:not([hidden])`,    description: 'ID element — exclude hidden',       subTab: 'logical', category: 'logical', reliability: 'high'   });
  }
  if (attrs.name) {
    v.push({ selector: `[name="${ea(attrs.name)}"]:not([disabled])`, description: 'name attribute — not disabled', subTab: 'logical', category: 'logical', reliability: 'medium' });
    v.push({ selector: `[name="${ea(attrs.name)}"]:not([readonly])`, description: 'name attribute — not readonly', subTab: 'logical', category: 'logical', reliability: 'medium' });
  }
  if (attrs.type) {
    v.push({ selector: `${tag}[type="${attrs.type}"]:not([disabled])`, description: `${tag}[type] — not disabled`, subTab: 'logical', category: 'logical', reliability: 'medium' });
  }
  if (attrs.id && attrs.name) {
    v.push({ selector: `[id="${ea(attrs.id)}"][name="${ea(attrs.name)}"]`, description: 'Both id AND name present', subTab: 'logical', category: 'logical', reliability: 'high' });
  }
  if (attrs.ariaLabel && attrs.id) {
    v.push({ selector: `[aria-label="${ea(attrs.ariaLabel)}"][id="${ea(attrs.id)}"]`, description: 'ARIA label AND ID', subTab: 'logical', category: 'logical', reliability: 'high' });
  }

  // ── PSEUDO (:nth-child, :first-child, :first-of-type etc.) ────────────
  v.push({ selector: `${tag}:first-child`,            description: `${tag} that is the first child`,        subTab: 'pseudo', category: 'pseudo', reliability: 'low' });
  v.push({ selector: `${tag}:last-child`,             description: `${tag} that is the last child`,         subTab: 'pseudo', category: 'pseudo', reliability: 'low' });
  v.push({ selector: `${tag}:first-of-type`,          description: `First ${tag} of its type`,              subTab: 'pseudo', category: 'pseudo', reliability: 'low' });
  v.push({ selector: `${tag}:last-of-type`,           description: `Last ${tag} of its type`,               subTab: 'pseudo', category: 'pseudo', reliability: 'low' });
  v.push({ selector: `${tag}:nth-of-type(1)`,         description: `First ${tag} by type-index`,            subTab: 'pseudo', category: 'pseudo', reliability: 'low' });
  v.push({ selector: `${tag}:nth-last-of-type(1)`,    description: `Last ${tag} counting from bottom`,      subTab: 'pseudo', category: 'pseudo', reliability: 'low' });
  v.push({ selector: `${tag}:nth-child(1)`,           description: `${tag} when it is child #1`,            subTab: 'pseudo', category: 'pseudo', reliability: 'low' });
  v.push({ selector: `${tag}:nth-last-child(1)`,      description: `${tag} when it is last child`,          subTab: 'pseudo', category: 'pseudo', reliability: 'low' });
  if (attrs.type) {
    v.push({ selector: `${tag}[type="${attrs.type}"]:first-of-type`, description: `First ${tag}[type] element`, subTab: 'pseudo', category: 'pseudo', reliability: 'low' });
    v.push({ selector: `${tag}[type="${attrs.type}"]:not(:disabled)`, description: 'type + not disabled', subTab: 'pseudo', category: 'pseudo', reliability: 'medium' });
    v.push({ selector: `${tag}[type="${attrs.type}"]:not(:hidden)`,   description: 'type + not hidden',    subTab: 'pseudo', category: 'pseudo', reliability: 'medium' });
  }
  if (attrs.id) {
    v.push({ selector: `#${ec(attrs.id)}:not(:disabled)`, description: 'ID — not disabled',              subTab: 'pseudo', category: 'pseudo', reliability: 'high' });
    v.push({ selector: `#${ec(attrs.id)}:focus`,          description: 'ID — when focused',              subTab: 'pseudo', category: 'pseudo', reliability: 'medium' });
  }

  // ── HIERARCHICAL (>, +, ~, descendant) ─────────────────────────────────
  v.push({ selector: `form > ${tag}`,                 description: `Direct child of form`,                  subTab: 'hierarchical', category: 'hierarchical', reliability: 'low' });
  v.push({ selector: `div > ${tag}`,                  description: `Direct child of div`,                   subTab: 'hierarchical', category: 'hierarchical', reliability: 'low' });
  v.push({ selector: `label + ${tag}`,                description: `${tag} immediately after label`,        subTab: 'hierarchical', category: 'hierarchical', reliability: 'low' });
  v.push({ selector: `label ~ ${tag}`,                description: `${tag} following label (any sibling)`,  subTab: 'hierarchical', category: 'hierarchical', reliability: 'low' });
  v.push({ selector: `.centered > *:nth-child(1)`,    description: 'First child inside .centered',          subTab: 'hierarchical', category: 'hierarchical', reliability: 'low' });
  v.push({ selector: `.centered > *:first-child`,     description: 'First child via universal selector',    subTab: 'hierarchical', category: 'hierarchical', reliability: 'low' });
  if (attrs.id) {
    v.push({ selector: `* > #${ec(attrs.id)}`,        description: `Any parent's child with ID`,            subTab: 'hierarchical', category: 'hierarchical', reliability: 'high'   });
    v.push({ selector: `form #${ec(attrs.id)}`,       description: `Descendant of form with ID`,            subTab: 'hierarchical', category: 'hierarchical', reliability: 'high'   });
    v.push({ selector: `div #${ec(attrs.id)}`,        description: `Descendant of div with ID`,             subTab: 'hierarchical', category: 'hierarchical', reliability: 'high'   });
  }
  if (attrs.name) {
    v.push({ selector: `form [name="${ea(attrs.name)}"]`,   description: 'Form descendant with name',       subTab: 'hierarchical', category: 'hierarchical', reliability: 'high'   });
    v.push({ selector: `form > [name="${ea(attrs.name)}"]`, description: 'Direct form child with name',     subTab: 'hierarchical', category: 'hierarchical', reliability: 'medium' });
    v.push({ selector: `div > [name="${ea(attrs.name)}"]`,  description: 'Direct div child with name',      subTab: 'hierarchical', category: 'hierarchical', reliability: 'medium' });
  }
  if (attrs.className) {
    const cls = attrs.className.split(/\s+/)[0];
    if (cls) {
      v.push({ selector: `${tag}.${ec(cls)} + *`,     description: `General sibling after ${tag}.${cls}`,  subTab: 'hierarchical', category: 'hierarchical', reliability: 'low' });
      v.push({ selector: `${tag}.${ec(cls)} ~ *`,     description: `All following siblings`,               subTab: 'hierarchical', category: 'hierarchical', reliability: 'low' });
    }
  }

  return v;
}

// ─── XPath variant generator ────────────────────────────────────────────────
export function generateAllXPathVariants(attrs: ElementAttributes): XPathVariant[] {
  const v: XPathVariant[] = [];
  const tag = attrs.tagName.toLowerCase();
  const e = ea; // alias

  // ── CORE ─────────────────────────────────────────────────────────────────
  if (attrs.id) {
    v.push({ xpath: `//*[@id="${e(attrs.id)}"]`,              description: 'Any tag with this ID',            subTab: 'core', reliability: 'high'   });
    v.push({ xpath: `//${tag}[@id="${e(attrs.id)}"]`,         description: `${tag} with this ID`,             subTab: 'core', reliability: 'high'   });
  }
  if (attrs.testId) {
    v.push({ xpath: `//*[@data-testid="${e(attrs.testId)}"]`, description: 'Test ID attribute',               subTab: 'core', reliability: 'high'   });
  }
  if (attrs.name) {
    v.push({ xpath: `//${tag}[@name="${e(attrs.name)}"]`,     description: `${tag} by name`,                  subTab: 'core', reliability: 'high'   });
  }
  if (attrs.ariaLabel) {
    v.push({ xpath: `//${tag}[@aria-label="${e(attrs.ariaLabel)}"]`, description: 'ARIA label',              subTab: 'core', reliability: 'high'   });
  }
  if (attrs.placeholder) {
    v.push({ xpath: `//${tag}[@placeholder="${e(attrs.placeholder)}"]`, description: 'Placeholder attribute', subTab: 'core', reliability: 'medium' });
  }
  if (attrs.alt) {
    v.push({ xpath: `//${tag}[@alt="${e(attrs.alt)}"]`,       description: 'alt text attribute',              subTab: 'core', reliability: 'medium' });
  }
  if (attrs.type) {
    v.push({ xpath: `//${tag}[@type="${attrs.type}"]`,        description: `${tag}[type="${attrs.type}"]`,    subTab: 'core', reliability: 'low'    });
  }
  v.push({ xpath: `//${tag}`,                                 description: `All ${tag} elements (not unique)`, subTab: 'core', reliability: 'low'  });

  // ── LOGICAL (and / or / not) ──────────────────────────────────────────
  if (attrs.type && attrs.name) {
    v.push({ xpath: `//${tag}[@type="${attrs.type}" and @name="${e(attrs.name)}"]`,        description: 'type AND name',                  subTab: 'logical', reliability: 'high'   });
  }
  if (attrs.type && attrs.id) {
    v.push({ xpath: `//${tag}[@type="${attrs.type}" and @id="${e(attrs.id)}"]`,            description: 'type AND id',                    subTab: 'logical', reliability: 'high'   });
  }
  if (attrs.name && attrs.placeholder) {
    v.push({ xpath: `//${tag}[@name="${e(attrs.name)}" and @placeholder="${e(attrs.placeholder)}"]`, description: 'name AND placeholder', subTab: 'logical', reliability: 'high'   });
  }
  if (attrs.id) {
    v.push({ xpath: `//${tag}[not(@disabled) and @id="${e(attrs.id)}"]`,                  description: 'not disabled AND has id',        subTab: 'logical', reliability: 'high'   });
    v.push({ xpath: `//${tag}[@id="${e(attrs.id)}" and not(@readonly)]`,                  description: 'has id AND not readonly',        subTab: 'logical', reliability: 'high'   });
  }
  if (attrs.type) {
    v.push({ xpath: `//${tag}[not(@disabled)][@type="${attrs.type}"]`,                    description: 'type AND not disabled',          subTab: 'logical', reliability: 'medium' });
    v.push({ xpath: `//${tag}[@type="${attrs.type}" or @type="search"]`,                  description: 'type OR search (OR example)',    subTab: 'logical', reliability: 'low'    });
  }
  if (attrs.name && attrs.id) {
    v.push({ xpath: `//${tag}[@name="${e(attrs.name)}" or @id="${e(attrs.id)}"]`,         description: 'name OR id (flexible)',          subTab: 'logical', reliability: 'medium' });
  }

  // ── PARTIAL (contains, starts-with, ends-with) ───────────────────────
  if (attrs.id && attrs.id.length >= 4) {
    const pre = attrs.id.slice(0, 3), mid = attrs.id.length > 4 ? attrs.id.slice(1, -1) : attrs.id.slice(0,-1);
    v.push({ xpath: `//${tag}[starts-with(@id, "${e(pre)}")]`,                            description: `ID starts with "${pre}"`,        subTab: 'partial', reliability: 'medium' });
    v.push({ xpath: `//${tag}[contains(@id, "${e(mid)}")]`,                               description: `ID contains "${mid}"`,           subTab: 'partial', reliability: 'medium' });
    v.push({ xpath: `//${tag}[not(starts-with(@id, "x")) and @id="${e(attrs.id)}"]`,      description: 'ID exact + negative starts-with', subTab: 'partial', reliability: 'high' });
  }
  if (attrs.name && attrs.name.length >= 3) {
    const pre = attrs.name.slice(0, 3);
    v.push({ xpath: `//${tag}[starts-with(@name, "${e(pre)}")]`,                          description: `name starts with "${pre}"`,      subTab: 'partial', reliability: 'medium' });
    v.push({ xpath: `//${tag}[contains(@name, "${e(attrs.name.slice(0, -1))}")]`,         description: `name contains substring`,        subTab: 'partial', reliability: 'medium' });
  }
  if (attrs.className) {
    const cls = attrs.className.split(/\s+/)[0];
    if (cls) v.push({ xpath: `//${tag}[contains(@class, "${e(cls)}")]`,                   description: `class contains "${cls}"`,        subTab: 'partial', reliability: 'low'    });
  }
  if (attrs.placeholder) {
    const first = attrs.placeholder.split(' ')[0];
    v.push({ xpath: `//${tag}[contains(@placeholder, "${e(first)}")]`,                    description: `placeholder contains "${first}"`, subTab: 'partial', reliability: 'medium' });
    v.push({ xpath: `//${tag}[starts-with(@placeholder, "${e(first)}")]`,                 description: `placeholder starts with "${first}"`, subTab: 'partial', reliability: 'medium' });
  }
  if (attrs.ariaLabel) {
    const firstWord = attrs.ariaLabel.split(' ')[0];
    v.push({ xpath: `//${tag}[contains(@aria-label, "${e(firstWord)}")]`,                 description: `ARIA label contains "${firstWord}"`, subTab: 'partial', reliability: 'medium' });
    v.push({ xpath: `//${tag}[starts-with(@aria-label, "${e(firstWord)}")]`,              description: `ARIA label starts with "${firstWord}"`, subTab: 'partial', reliability: 'medium' });
  }

  // ── TEXT-BASED ────────────────────────────────────────────────────────
  if (attrs.innerText) {
    const txt = attrs.innerText;
    const firstWord = txt.split(' ')[0];
    v.push({ xpath: `//${tag}[text()="${e(txt)}"]`,                                       description: 'Exact text match',               subTab: 'text', reliability: 'medium' });
    v.push({ xpath: `//${tag}[normalize-space()="${e(txt)}"]`,                            description: 'Normalized whitespace match',     subTab: 'text', reliability: 'medium' });
    v.push({ xpath: `//${tag}[contains(text(), "${e(firstWord)}")]`,                      description: `Text contains "${firstWord}"`,   subTab: 'text', reliability: 'low'    });
    v.push({ xpath: `//*[text()="${e(txt)}"]`,                                            description: 'Any element with this text',     subTab: 'text', reliability: 'low'    });
    v.push({ xpath: `//*[normalize-space(text())="${e(txt)}"]`,                           description: 'Any element — normalized text',  subTab: 'text', reliability: 'low'    });
  }
  if (attrs.labelText) {
    const lt = attrs.labelText;
    v.push({ xpath: `//label[text()="${e(lt)}"]/following-sibling::${tag}`,               description: `Following sibling ${tag} after label`, subTab: 'text', reliability: 'medium' });
    v.push({ xpath: `//label[normalize-space()="${e(lt)}"]/following-sibling::${tag}[1]`, description: 'First sibling after label (normalized)', subTab: 'text', reliability: 'medium' });
    v.push({ xpath: `//label[contains(text(), "${e(lt.split(' ')[0])}")]//following-sibling::${tag}`, description: 'Partial label text sibling', subTab: 'text', reliability: 'low' });
  }
  if (attrs.placeholder) {
    v.push({ xpath: `//${tag}[@placeholder and normalize-space(@placeholder)="${e(attrs.placeholder)}"]`, description: 'Placeholder — normalized', subTab: 'text', reliability: 'medium' });
  }

  // ── INDEXING ──────────────────────────────────────────────────────────
  v.push({ xpath: `(//${tag})[1]`,                                                        description: `First ${tag} in document`,       subTab: 'indexing', reliability: 'low'  });
  v.push({ xpath: `(//${tag})[last()]`,                                                   description: `Last ${tag} in document`,        subTab: 'indexing', reliability: 'low'  });
  v.push({ xpath: `(//${tag})[position()=1]`,                                             description: 'Using position() function',      subTab: 'indexing', reliability: 'low'  });
  v.push({ xpath: `(//${tag})[position()=last()]`,                                        description: 'Last element via position()',    subTab: 'indexing', reliability: 'low'  });
  if (attrs.type) {
    v.push({ xpath: `(//${tag}[@type="${attrs.type}"])[1]`,                               description: `First ${tag}[type] in document`, subTab: 'indexing', reliability: 'low'  });
    v.push({ xpath: `(//${tag}[@type="${attrs.type}"])[last()]`,                           description: `Last ${tag}[type] in document`,  subTab: 'indexing', reliability: 'low'  });
    v.push({ xpath: `count(//${tag}[@type="${attrs.type}"])`,                              description: `Count of ${tag}[type] elements`, subTab: 'indexing', reliability: 'low'  });
  }
  if (attrs.id) {
    v.push({ xpath: `(//*[@id="${e(attrs.id)}"])[1]`,                                     description: 'First element with this ID',     subTab: 'indexing', reliability: 'high' });
  }
  v.push({ xpath: `(//${tag})[2]`,                                                        description: `Second ${tag} occurrence`,       subTab: 'indexing', reliability: 'low'  });

  // ── AXES ──────────────────────────────────────────────────────────────
  v.push({ xpath: `//${tag}/ancestor::form`,                                              description: `ancestor form of ${tag}`,        subTab: 'axes', reliability: 'low'    });
  v.push({ xpath: `//${tag}/ancestor::div`,                                               description: `ancestor div of ${tag}`,         subTab: 'axes', reliability: 'low'    });
  v.push({ xpath: `//${tag}/parent::*`,                                                   description: `Direct parent of ${tag}`,        subTab: 'axes', reliability: 'low'    });
  v.push({ xpath: `//${tag}/following-sibling::*[1]`,                                     description: 'Next sibling element',           subTab: 'axes', reliability: 'low'    });
  v.push({ xpath: `//${tag}/preceding-sibling::label[1]`,                                 description: 'Preceding sibling label',        subTab: 'axes', reliability: 'low'    });
  if (attrs.name) {
    v.push({ xpath: `//${tag}[@name="${e(attrs.name)}"]/parent::*`,                       description: 'Parent of named element',        subTab: 'axes', reliability: 'medium' });
    v.push({ xpath: `//form/descendant::${tag}[@name="${e(attrs.name)}"]`,                description: 'descendant:: from form',         subTab: 'axes', reliability: 'medium' });
    v.push({ xpath: `//${tag}[@name="${e(attrs.name)}"]/following-sibling::*[1]`,         description: 'Next sibling after named element', subTab: 'axes', reliability: 'medium' });
    v.push({ xpath: `//${tag}[@name="${e(attrs.name)}"]/preceding-sibling::label[1]`,     description: 'Preceding label before named',   subTab: 'axes', reliability: 'medium' });
  }
  if (attrs.labelText) {
    const lt = attrs.labelText;
    v.push({ xpath: `//label[.="${e(lt)}"]/following::${tag}[1]`,                        description: 'following:: axis after label',   subTab: 'axes', reliability: 'medium' });
    v.push({ xpath: `//label[text()="${e(lt)}"]/following-sibling::${tag}[1]`,            description: 'following-sibling after label',  subTab: 'axes', reliability: 'medium' });
    v.push({ xpath: `//label[.="${e(lt)}"]/ancestor::div//${tag}`,                        description: 'ancestor div then descendant',   subTab: 'axes', reliability: 'low'    });
  }
  if (attrs.id) {
    v.push({ xpath: `//${tag}[@id="${e(attrs.id)}"]/ancestor-or-self::*`,                 description: 'ancestor-or-self axis',          subTab: 'axes', reliability: 'medium' });
  }

  return v;
}

// ─── Best-single CSS (for header display) ────────────────────────────────────
export interface CSSResult {
  selector: string;
  reliability: 'high' | 'medium' | 'low';
  explanation: string;
}

export function generateCSS(attrs: ElementAttributes): CSSResult {
  const tag = attrs.tagName.toLowerCase();
  if (attrs.id)          return { selector: `#${ec(attrs.id)}`,                              reliability: 'high',   explanation: 'ID selector — fast, but relies on id stability.' };
  if (attrs.testId)      return { selector: `[data-testid="${ea(attrs.testId)}"]`,           reliability: 'high',   explanation: 'Test-ID attribute — stable if your team adds these.' };
  if (attrs.ariaLabel)   return { selector: `${tag}[aria-label="${ea(attrs.ariaLabel)}"]`, reliability: 'high',   explanation: 'ARIA label — semantically meaningful and stable.' };
  if (attrs.name && attrs.type) return { selector: `${tag}[type="${attrs.type}"][name="${ea(attrs.name)}"]`, reliability: 'high', explanation: 'Type + name combination.' };
  if (attrs.placeholder) return { selector: `${tag}[placeholder="${ea(attrs.placeholder)}"]`, reliability: 'medium', explanation: 'Placeholder text.' };
  if (attrs.name)        return { selector: `${tag}[name="${ea(attrs.name)}"]`,              reliability: 'medium', explanation: 'Name attribute — common on form elements.' };
  if (attrs.alt)         return { selector: `${tag}[alt="${ea(attrs.alt)}"]`,               reliability: 'medium', explanation: 'Alt text attribute.' };
  if (attrs.title)       return { selector: `${tag}[title="${ea(attrs.title)}"]`,           reliability: 'medium', explanation: 'Title attribute.' };
  if (attrs.className) { const c = attrs.className.split(/\s+/)[0]; if (c) return { selector: `${tag}.${ec(c)}`, reliability: 'low', explanation: 'Class name — breaks when styles change.' }; }
  return { selector: tag, reliability: 'low', explanation: 'Tag name only — not unique. Consider adding data-testid.' };
}

// ─── Best-single XPath ───────────────────────────────────────────────────────
export interface XPathResult {
  xpath: string;
  reliability: 'high' | 'medium' | 'low';
  explanation: string;
}

export function generateXPath(attrs: ElementAttributes): XPathResult {
  const tag = attrs.tagName.toLowerCase();
  if (attrs.id)          return { xpath: `//*[@id="${ea(attrs.id)}"]`,                         reliability: 'high',   explanation: 'ID attribute — direct and fast.' };
  if (attrs.testId)      return { xpath: `//*[@data-testid="${ea(attrs.testId)}"]`,           reliability: 'high',   explanation: 'Test-ID attribute.' };
  if (attrs.ariaLabel)   return { xpath: `//${tag}[@aria-label="${ea(attrs.ariaLabel)}"]`,    reliability: 'high',   explanation: 'ARIA label.' };
  if (attrs.name)        return { xpath: `//${tag}[@name="${ea(attrs.name)}"]`,               reliability: 'medium', explanation: 'Name attribute.' };
  if (attrs.placeholder) return { xpath: `//${tag}[@placeholder="${ea(attrs.placeholder)}"]`, reliability: 'medium', explanation: 'Placeholder attribute.' };
  if (attrs.innerText)   return { xpath: `//${tag}[normalize-space()="${ea(attrs.innerText)}"]`, reliability: 'medium', explanation: 'Exact text content.' };
  if (attrs.alt)         return { xpath: `//${tag}[@alt="${ea(attrs.alt)}"]`,                 reliability: 'medium', explanation: 'Alt text attribute.' };
  return { xpath: `//${tag}`, reliability: 'low', explanation: 'Tag name only — very fragile.' };
}

// ─── page.locator() code generator ───────────────────────────────────────────
export function toLocatorCode(selector: string, lang: TargetLanguage): string {
  const e  = (s: string) => s.replace(/"/g, '\\"');
  const eq = (s: string) => s.replace(/'/g, "\\'");
  switch (lang) {
    case 'typescript': case 'javascript': return `page.locator('${eq(selector)}')`;
    case 'python_sync': case 'python_async': return `page.locator("${e(selector)}")`;
    case 'java':                              return `page.locator("${e(selector)}")`;
    case 'csharp_sync': case 'csharp_async': return `Page.Locator("${e(selector)}")`;
  }
}

/** Wraps an XPath in page.locator(), using XPath auto-detection (//) */
export function toXPathLocatorCode(xpath: string, lang: TargetLanguage): string {
  // Playwright auto-detects XPath when expression starts with //
  return toLocatorCode(xpath, lang);
}

/** Generates all page.locator() CSS code variants (for the Playwright card) */
export function generateAllLocatorVariants(attrs: ElementAttributes, lang: TargetLanguage) {
  return generateAllCSSVariants(attrs).map(v => ({
    ...v,
    code: toLocatorCode(v.selector, lang),
  }));
}
