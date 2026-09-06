/**
 * WS5 — the panel vocabulary, declared once.
 *
 * `SidePanel.tsx` and `Panel.tsx` each carried a byte-identical copy of these
 * three declarations (DL-67 measured them identical, whitespace-normalised and
 * comment-stripped). Two copies of a type is how two surfaces start to mean
 * different things by the same word.
 */
import type { TargetLanguage } from '@playwright-guru/codegen';

/** The three top-level locator strategies a panel can show. */
export type MainTab = 'playwright' | 'css' | 'xpath';

/** The target language generated code is rendered in. */
export type PwLang = TargetLanguage;

/** One entry in the contextual action dropdown. */
export interface ActionOption {
  label: string;
  value: string;
  hint: string;
}

/**
 * What a surface can do, expressed as DATA.
 *
 * The WS0 `PickSource` port introduced this idea and WS5 finally uses it: a
 * capability a surface lacks becomes an absent control, not an `if (isDevtools)`
 * spread through the component tree.
 */
export interface SurfaceCapabilities {
  /** The Side Panel arms the element picker; DevTools follows `$0`. */
  readonly canActivatePicker: boolean;
  /** DevTools mirrors the Elements-panel selection and can re-read it. */
  readonly canReinspect: boolean;
  /** Recording needs persistent page listeners — Side Panel only (WS9). */
  readonly canRecord: boolean;
}

/** A raw CSS/XPath Verify Selector outcome, as both panels have always shaped it. */
export interface VerifyOutcome {
  count: number;
  visibleCount?: number;
  error?: string;
  verifyStatus?: import('../../../utils/messaging').VerificationStatus;
}
