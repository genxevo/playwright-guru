/**
 * WS5 — the shared panel presentation layer.
 *
 * One implementation of the product's UI, consumed by both surfaces. Nothing
 * here imports a browser API, and R5 keeps it that way: a component that knew
 * which surface it was on is exactly how the Side Panel and the DevTools panel
 * drifted apart in the first place.
 */
export { ActionStrip } from './ActionStrip';
export { CodeWorkspace } from './CodeWorkspace';
export { ElementHtml } from './ElementHtml';
export { HeaderButton } from './HeaderButton';
export { PanelFrame, type PanelEmptyState, type PanelStatus } from './PanelFrame';
export { RecommendedCard } from './RecommendedCard';
export { VerifySelectorCard } from './VerifySelectorCard';
export { ALL_GETBY_KINDS, LANGS, NO_ACTION, type GetByKind } from './constants';
export { getContextualActions, getDefaultAction, resolveAction } from './contextual-actions';
export { CSSRow, LocatorRow, XPathRow } from './rows';
export { CssTab, PlaywrightTab, XPathTab } from './strategy-tabs';
export type { ActionOption, MainTab, PwLang, SurfaceCapabilities, VerifyOutcome } from './types';
export { verifyColorFor, verifyMessageFor, visibleCountOf } from './verify-message';
