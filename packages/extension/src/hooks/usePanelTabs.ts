/**
 * WS5 — which tab and sub-tab a panel is showing.
 *
 * Three pieces of pure view state that both panels declared separately and
 * drove identically. They live together because they are one question — "what
 * is the user looking at" — and because keeping them here is what lets the
 * entrypoints stop holding view state at all.
 */
import { useState } from 'react';

import type { CSSSubTab, XPathSubTab } from '../../utils/css-xpath';
import type { MainTab } from '../ui/panel/types';

export interface PanelTabsApi {
  mainTab: MainTab;
  setMainTab: (t: MainTab) => void;
  cssSubTab: CSSSubTab;
  setCssSubTab: (t: CSSSubTab) => void;
  xpathSubTab: XPathSubTab;
  setXpathSubTab: (t: XPathSubTab) => void;
}

export function usePanelTabs(): PanelTabsApi {
  const [mainTab, setMainTab] = useState<MainTab>('playwright');
  const [cssSubTab, setCssSubTab] = useState<CSSSubTab>('core');
  const [xpathSubTab, setXpathSubTab] = useState<XPathSubTab>('core');
  return { mainTab, setMainTab, cssSubTab, setCssSubTab, xpathSubTab, setXpathSubTab };
}
