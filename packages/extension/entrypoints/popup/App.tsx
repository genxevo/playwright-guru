/**
 * Playwright Guru — Popup launcher
 *
 * This popup exists only so Chrome has an action entry point.
 * It immediately opens the Side Panel and closes itself, making the popup
 * effectively invisible to the user. Clicking the toolbar icon opens the
 * full inspector panel directly.
 */
import { useEffect } from 'react';

export function App() {
  useEffect(() => {
    void (async () => {
      try {
        const win = await chrome.windows.getCurrent();
        // Open the side panel (Chrome sidePanel API)
        // @ts-expect-error — chrome.sidePanel not in WXT types
        await chrome.sidePanel.open({ windowId: win.id });
      } catch (err) {
        // Side panel may already be open — no-op
        console.info('[PlaywrightGuru] Side panel open:', err);
      } finally {
        // Close this popup — it should never be visible to the user
        window.close();
      }
    })();
  }, []);

  // Render nothing — the popup closes before first paint
  return null;
}
