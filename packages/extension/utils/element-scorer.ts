/**
 * UI-side wrapper around the locator-engine's DOM-free orchestration.
 * Used by the DevTools panel and popup as a fallback when StoredPick.chain
 * is not available (e.g., old picks stored before Phase 5).
 */

import {
  buildLocatorChainFromAttributes,
  getElementDescription,
  type LocatorChain,
  type ElementAttributes,
  type FrameInfo,
} from '@playwright-guru/locator-engine';

export { getElementDescription };

/**
 * Converts raw captured element attributes into the best LocatorChain
 * that can be determined without live DOM uniqueness data.
 * All candidates are treated as having unknown uniqueness (-1).
 */
export function buildLocatorChain(
  attrs: ElementAttributes,
  frameInfo?: FrameInfo
): LocatorChain {
  return buildLocatorChainFromAttributes(attrs, frameInfo);
}
