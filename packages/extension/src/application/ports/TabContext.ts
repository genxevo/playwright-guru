/**
 * Playwright Guru — TabContext port (WS0 contract only).
 * ---------------------------------------------------------------------------
 * Which tab (and frame) the surface is operating on.
 *
 * Session state is tab-scoped: Phase 0 found one global picker flag shared
 * across every tab, so deactivating in one told the panel the picker was off
 * while another tab was still in crosshair mode.
 */

export interface TabInfo {
  tabId: number;
  url?: string;
  title?: string;
}

export interface TabContext {
  getActiveTab(): Promise<TabInfo | null>;
  subscribe(listener: (tab: TabInfo | null) => void): () => void;
}
