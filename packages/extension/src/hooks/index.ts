/**
 * WS5 — the application hooks layer.
 *
 * Eight focused hooks and one composition. Each owns one question; none knows
 * which surface it is running on, and none reaches for a browser API — R1 keeps
 * that in `src/browser/**` and `entrypoints/**`, and these reach it through the
 * ports and adapters instead.
 */
export { useActionMode, type ActionModeApi } from './useActionMode';
export { useCodeWorkspace, type CodeWorkspaceApi } from './useCodeWorkspace';
export { useCopyAll, type CopyAllApi, type CopyState } from './useCopyAll';
export { useLanguage } from './useLanguage';
export { useLocatorDerivation, type DerivedLocators } from './useLocatorDerivation';
export { usePanel, type PanelController, type PanelDeps } from './usePanel';
export { usePanelTabs, type PanelTabsApi } from './usePanelTabs';
export { usePickSource, type PickApi } from './usePickSource';
export { useVerify, type VerifyApi } from './useVerify';
