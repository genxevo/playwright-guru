/**
 * Playwright Guru — picker lifecycle (WS3).
 * ---------------------------------------------------------------------------
 * Element-picking UI, extracted unchanged in behaviour from `content.ts`, with
 * two upgrades locked by the WS3 design:
 *
 *   CLOSED SHADOW ROOT   The highlight overlay now lives inside a closed
 *                         `ShadowRoot` on a single host element. A page's own
 *                         script cannot reach `host.shadowRoot` (closed mode
 *                         returns `null`), so the overlay is isolated from
 *                         page CSS and page JS the way an open root or a bare
 *                         appended `<div>` was not. Visual properties (the
 *                         orange 2px border, the position/size math) are
 *                         unchanged.
 *
 *   rAF-THROTTLED PAINT   `pointerover` can fire far faster than layout
 *                         changes are meaningful; highlight painting is now
 *                         coalesced to at most once per animation frame via
 *                         `requestAnimationFrame`, rather than synchronously
 *                         forcing a style write (and the layout read behind
 *                         `getBoundingClientRect`) on every event.
 */

const HOST_ID = 'playwright-guru-highlight-host';

const BOX_STYLE =
  'position:fixed;pointer-events:none;box-sizing:border-box;border:2px solid #f97316;' +
  'background:rgba(249,115,22,0.12);border-radius:2px;display:none;top:0;left:0;width:0;height:0;';

export interface Picker {
  activate(): void;
  deactivate(): void;
  isActive(): boolean;
}

export function createPicker(onPick: (el: Element) => void): Picker {
  let active = false;
  let host: HTMLElement | null = null;
  let box: HTMLElement | null = null;
  let rafHandle: number | null = null;
  let pendingTarget: Element | null = null;

  function ensureOverlay(): HTMLElement {
    if (box) return box;
    host = document.createElement('div');
    host.id = HOST_ID;
    // `all: initial` isolates the host from page CSS; the later declarations
    // in the SAME string win the cascade for the properties that matter.
    host.style.cssText =
      'all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483647;';
    const root = host.attachShadow({ mode: 'closed' });
    const el = document.createElement('div');
    el.style.cssText = BOX_STYLE;
    root.appendChild(el);
    document.documentElement.appendChild(host);
    box = el;
    return el;
  }

  function scheduleHighlight(el: Element): void {
    pendingTarget = el;
    if (rafHandle !== null) return;
    rafHandle = requestAnimationFrame(() => {
      rafHandle = null;
      const target = pendingTarget;
      pendingTarget = null;
      if (target) paintHighlight(target);
    });
  }

  function paintHighlight(el: Element): void {
    const b = ensureOverlay();
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) {
      hideHighlight();
      return;
    }
    b.style.top = `${r.top}px`;
    b.style.left = `${r.left}px`;
    b.style.width = `${r.width}px`;
    b.style.height = `${r.height}px`;
    b.style.display = 'block';
  }

  function hideHighlight(): void {
    if (rafHandle !== null) {
      cancelAnimationFrame(rafHandle);
      rafHandle = null;
      pendingTarget = null;
    }
    if (box) box.style.display = 'none';
  }

  function onPointerOver(e: Event): void {
    const el = e.target as Element | null;
    if (!el || el === host) return;
    scheduleHighlight(el);
  }
  function onMouseLeaveDoc(): void {
    hideHighlight();
  }

  function onClick(e: Event): void {
    const el = e.target as Element | null;
    if (!el || el === host) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    onPick(el);
    deactivate();
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      deactivate();
    }
  }

  function activate(): void {
    if (active) return;
    active = true;
    ensureOverlay();
    document.addEventListener('pointerover', onPointerOver, { capture: true });
    document.addEventListener('click', onClick, { capture: true });
    document.addEventListener('keydown', onKeyDown, { capture: true });
    document.documentElement.addEventListener('mouseleave', onMouseLeaveDoc);
    document.documentElement.style.cursor = 'crosshair';
  }

  function deactivate(): void {
    if (!active) return;
    active = false;
    document.removeEventListener('pointerover', onPointerOver, { capture: true });
    document.removeEventListener('click', onClick, { capture: true });
    document.removeEventListener('keydown', onKeyDown, { capture: true });
    document.documentElement.removeEventListener('mouseleave', onMouseLeaveDoc);
    document.documentElement.style.cursor = '';
    hideHighlight();
  }

  return { activate, deactivate, isActive: () => active };
}
