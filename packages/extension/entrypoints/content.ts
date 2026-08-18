import { defineContentScript } from 'wxt/utils/define-content-script';
import { browser } from 'wxt/browser';
import {
  ROLE_CSS_SELECTORS, buildCandidateSteps, buildLocatorChain,
  scoreCandidate, rankCandidates, pickBestUnique,
  type LocatorStep, type LocatorChain, type ScoredCandidate, type ElementAttributes,
} from '@playwright-guru/locator-engine';
import type { RuntimeMessage, RuntimeMessageAck, StoredPick, FrameInfo, VerifySelectorMessage, RecordedAction, StartRecordingMessage, StopRecordingMessage } from '../utils/messaging';

const HIGHLIGHT_ID = 'playwright-guru-highlight';
const LOG = '[PlaywrightGuru/content]';

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    let pickerActive = false;
    let highlight: HTMLDivElement | null = null;

    // ── Message receiver ─────────────────────────────────────────────────
    browser.runtime.onMessage.addListener(
      (message: RuntimeMessage, _sender, sendResponse: (r: RuntimeMessageAck) => void) => {
        switch (message.type) {
          case 'ACTIVATE_PICKER':
            activatePicker(); sendResponse({ ok: true }); return false;
          case 'DEACTIVATE_PICKER':
            deactivatePicker(); sendResponse({ ok: true }); return false;
          case 'VERIFY_SELECTOR':
            handleVerify(message, sendResponse); return false;
          default: return false;
        }
      }
    );

    // ── Verify selector ──────────────────────────────────────────────────
    function handleVerify(msg: VerifySelectorMessage, sendResponse: (r: RuntimeMessageAck) => void) {
      let count = 0;
      try {
        if (msg.selectorType === 'css') {
          count = document.querySelectorAll(msg.selector).length;
        } else {
          const result = document.evaluate(
            `count(${msg.selector})`,
            document, null, XPathResult.NUMBER_TYPE, null
          );
          count = Math.round(result.numberValue);
        }
        sendResponse({ ok: true, count });
      } catch (e) {
        sendResponse({ ok: false, error: String(e), count: -1 });
      }
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────
    function activatePicker(): void {
      if (pickerActive) return;
      pickerActive = true;
      void browser.storage.local.set({ pg_picker_active: true });
      ensureHighlight();
      document.addEventListener('pointerover', onPointerOver, { capture: true });
      document.addEventListener('click',       onClick,       { capture: true });
      document.addEventListener('keydown',     onKeyDown,     { capture: true });
      document.documentElement.addEventListener('mouseleave', onMouseLeaveDoc);
      document.documentElement.style.cursor = 'crosshair';
      console.info(`${LOG} picker activated`);
    }

    function deactivatePicker(): void {
      if (!pickerActive) return;
      pickerActive = false;
      void browser.storage.local.set({ pg_picker_active: false });
      document.removeEventListener('pointerover', onPointerOver, { capture: true });
      document.removeEventListener('click',       onClick,       { capture: true });
      document.removeEventListener('keydown',     onKeyDown,     { capture: true });
      document.documentElement.removeEventListener('mouseleave', onMouseLeaveDoc);
      document.documentElement.style.cursor = '';
      hideHighlight();
    }

    // ── Events ────────────────────────────────────────────────────────────
    function onPointerOver(e: Event): void {
      const el = e.target as Element | null;
      if (!el || el.id === HIGHLIGHT_ID) return;
      updateHighlight(el);
    }
    function onMouseLeaveDoc(): void { hideHighlight(); }

    function onClick(e: Event): void {
      const el = e.target as Element | null;
      if (!el || el.id === HIGHLIGHT_ID) return;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      const pick = buildScoredPick(el);
      void browser.storage.local.set({ pg_last_pick: pick });
      deactivatePicker();
    }

    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); deactivatePicker(); }
    }


    // ── Recording ─────────────────────────────────────────────────────────────

    let recordingActive = false;
    let recFillTimer: ReturnType<typeof setTimeout> | null = null;
    let recFillEl: Element | null = null;
    let recFillVal = '';

    function startRecording(): void {
      if (recordingActive) return;
      if (pickerActive) deactivatePicker();      // modes are mutually exclusive
      recordingActive = true;
      void browser.storage.local.set({ pg_recording_active: true, pg_recorded_actions: [] });
      // Record the starting page URL as the first action
      void appendRecAction({ kind: 'goto', url: location.href, timestamp: Date.now() });
      document.addEventListener('click',  onRecClick,  { capture: true });
      document.addEventListener('input',  onRecInput,  { capture: true });
      document.addEventListener('change', onRecChange, { capture: true });
      console.info(`${LOG} recording started`);
    }

    function stopRecording(): void {
      if (!recordingActive) return;
      recordingActive = false;
      flushRecFill();
      void browser.storage.local.set({ pg_recording_active: false });
      document.removeEventListener('click',  onRecClick,  { capture: true });
      document.removeEventListener('input',  onRecInput,  { capture: true });
      document.removeEventListener('change', onRecChange, { capture: true });
      console.info(`${LOG} recording stopped`);
    }

    function flushRecFill(): void {
      if (recFillTimer) { clearTimeout(recFillTimer); recFillTimer = null; }
      if (recFillEl && recFillVal !== '') {
        void appendRecAction({ kind: 'fill', attrs: extractAttributes(recFillEl), value: recFillVal, timestamp: Date.now() });
        recFillEl = null; recFillVal = '';
      }
    }

    async function appendRecAction(action: RecordedAction): Promise<void> {
      const r = await browser.storage.local.get('pg_recorded_actions');
      const prev = (r['pg_recorded_actions'] as RecordedAction[]) ?? [];
      await browser.storage.local.set({ pg_recorded_actions: [...prev, action] });
    }

    function onRecClick(e: MouseEvent): void {
      if (!recordingActive) return;
      const el = e.target as Element | null;
      if (!el) return;
      const tag  = el.tagName.toLowerCase();
      const type = ((el as HTMLInputElement).type ?? '').toLowerCase();
      // Skip: checkboxes/radios (handled by change), text inputs (handled by input)
      if (type === 'checkbox' || type === 'radio') return;
      if ((tag === 'input' || tag === 'textarea') && !['button','submit','reset','image'].includes(type)) return;
      if (tag === 'select') return;
      flushRecFill();                             // commit any pending fill first
      const dbl = (e as PointerEvent).detail === 2;
      void appendRecAction({ kind: dbl ? 'dblclick' : 'click', attrs: extractAttributes(el), timestamp: Date.now() });
    }

    function onRecInput(e: Event): void {
      if (!recordingActive) return;
      const el = e.target as HTMLInputElement | HTMLTextAreaElement | null;
      if (!el) return;
      const tag  = el.tagName.toLowerCase();
      const type = ((el as HTMLInputElement).type ?? 'text').toLowerCase();
      if (tag !== 'input' && tag !== 'textarea') return;
      if (['checkbox','radio','file','button','submit','reset'].includes(type)) return;
      if (recFillEl && recFillEl !== el) flushRecFill();   // switched fields
      recFillEl  = el;
      recFillVal = el.value;
      if (recFillTimer) clearTimeout(recFillTimer);
      recFillTimer = setTimeout(flushRecFill, 600);        // debounce 600ms
    }

    function onRecChange(e: Event): void {
      if (!recordingActive) return;
      const el = e.target as HTMLElement | null;
      if (!el) return;
      const tag  = el.tagName.toLowerCase();
      const type = ((el as HTMLInputElement).type ?? '').toLowerCase();
      if (tag === 'select') {
        const val = (el as HTMLSelectElement).value;
        void appendRecAction({ kind: 'selectOption', attrs: extractAttributes(el), value: val, timestamp: Date.now() });
      } else if (type === 'checkbox') {
        const checked = (el as HTMLInputElement).checked;
        void appendRecAction({ kind: checked ? 'check' : 'uncheck', attrs: extractAttributes(el), timestamp: Date.now() });
      } else if (type === 'radio') {
        void appendRecAction({ kind: 'check', attrs: extractAttributes(el), timestamp: Date.now() });
      }
    }

    // ── Highlight ─────────────────────────────────────────────────────────
    function ensureHighlight(): HTMLDivElement {
      if (highlight) return highlight;
      const el = document.createElement('div');
      el.id = HIGHLIGHT_ID;
      el.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;box-sizing:border-box;border:2px solid #f97316;background:rgba(249,115,22,0.12);border-radius:2px;display:none;top:0;left:0;width:0;height:0;';
      document.documentElement.appendChild(el);
      highlight = el;
      return el;
    }
    function updateHighlight(el: Element): void {
      const h = ensureHighlight();
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) { hideHighlight(); return; }
      h.style.top = `${r.top}px`; h.style.left = `${r.left}px`;
      h.style.width = `${r.width}px`; h.style.height = `${r.height}px`;
      h.style.display = 'block';
    }
    function hideHighlight(): void { if (highlight) highlight.style.display = 'none'; }

    // ── Attribute extraction ──────────────────────────────────────────────
    function safeText(v: string | null | undefined, max = 100): string | undefined {
      if (!v) return undefined;
      const t = v.trim().replace(/\s+/g, ' ').slice(0, max);
      return t || undefined;
    }
    function cssEsc(str: string): string {
      try { return CSS.escape(str); } catch { return str.replace(/[^\w-]/g, c => `\\${c}`); }
    }

    function extractAttributes(el: Element): ElementAttributes {
      const tagName = el.tagName.toLowerCase();
      const id = el.id || undefined;
      const role = el.getAttribute('role') ?? undefined;
      const ariaLabel = el.getAttribute('aria-label') ?? undefined;
      const placeholder = el.getAttribute('placeholder') ?? undefined;
      const alt = el.getAttribute('alt') ?? undefined;
      const title = el.getAttribute('title') ?? undefined;
      const type = el.getAttribute('type') ?? undefined;
      const href = el instanceof HTMLAnchorElement ? el.href || undefined : undefined;
      const testId = el.getAttribute('data-testid') ?? el.getAttribute('data-test-id') ?? el.getAttribute('data-test') ?? undefined;
      const innerText = safeText((el as HTMLElement).innerText);

      let ariaLabelledBy: string | undefined;
      const lbId = el.getAttribute('aria-labelledby');
      if (lbId) {
        const resolved = lbId.split(/\s+/).map(id => document.getElementById(id)?.textContent?.trim() || '').filter(Boolean).join(' ');
        ariaLabelledBy = resolved || undefined;
      }

      let labelText: string | undefined;
      if (id) {
        try { labelText = safeText(document.querySelector<HTMLLabelElement>(`label[for="${cssEsc(id)}"]`)?.textContent); } catch { /* ignore */ }
      }
      if (!labelText) {
        const parentLabel = el.closest('label');
        if (parentLabel) {
          const clone = parentLabel.cloneNode(true) as Element;
          clone.querySelectorAll('input,select,textarea,button').forEach(c => c.remove());
          labelText = safeText(clone.textContent);
        }
      }

      const className = safeText(typeof el.className === 'string' ? el.className : undefined, 150);
      const name      = el.getAttribute('name') ?? undefined;
      return { tagName, id, type, role, ariaLabel, ariaLabelledBy, placeholder, alt, title, innerText, testId, labelText, href, className, name };
    }

    // ── Live accessible name (for DOM uniqueness queries) ──────────────────
    function getLiveAccessibleName(el: Element): string {
      const ariaLabel = el.getAttribute('aria-label');
      if (ariaLabel?.trim()) return ariaLabel.trim();
      const lbId = el.getAttribute('aria-labelledby');
      if (lbId) {
        const text = lbId.split(/\s+/).map(id => document.getElementById(id)?.textContent?.trim() || '').filter(Boolean).join(' ');
        if (text) return text;
      }
      const id = el.id;
      if (id) {
        try { const label = document.querySelector<HTMLLabelElement>(`label[for="${cssEsc(id)}"]`); if (label?.textContent?.trim()) return label.textContent.trim(); } catch { /* ignore */ }
      }
      const parentLabel = el.closest('label');
      if (parentLabel) {
        const clone = parentLabel.cloneNode(true) as Element;
        clone.querySelectorAll('input,select,textarea,button').forEach(c => c.remove());
        const t = clone.textContent?.trim(); if (t) return t;
      }
      return (el as HTMLElement).innerText?.trim() || el.getAttribute('value') || el.getAttribute('alt') || el.getAttribute('title') || '';
    }

    // ── DOM uniqueness counting ────────────────────────────────────────────

    /**
     * Playwright's locators are visibility-aware by default — they don't
     * match elements hidden with display:none or visibility:hidden.
     * Our raw querySelectorAll would otherwise count both the light-mode
     * and dark-mode versions of the same element (e.g. two <img> tags with
     * the same alt text, one of which is display:none), producing inflated
     * match counts and wrongly demoting good locators to "alternatives".
     */
    function isVisible(el: Element): boolean {
      const s = window.getComputedStyle(el as HTMLElement);
      if (s.display === 'none' || s.visibility === 'hidden') return false;
      if (parseFloat(s.opacity) === 0) return false;
      return true;
    }

    function visibleFrom(els: Iterable<Element>): Element[] {
      return Array.from(els).filter(isVisible);
    }

    function countStepMatches(step: LocatorStep, scope: Document | Element = document): number {
      const val = step.selectorValue.value;
      try {
        switch (step.kind) {
          case 'testId':
            return visibleFrom(scope.querySelectorAll(
              `[data-testid="${cssEsc(val)}"],[data-test-id="${cssEsc(val)}"],[data-test="${cssEsc(val)}"]`
            )).length;

          case 'placeholder':
            return visibleFrom(scope.querySelectorAll(`[placeholder="${cssEsc(val)}"]`)).length;

          case 'altText':
            return visibleFrom(scope.querySelectorAll(`[alt="${cssEsc(val)}"]`)).length;

          case 'title':
            return visibleFrom(scope.querySelectorAll(`[title="${cssEsc(val)}"]`)).length;

          case 'label': {
            const labels = visibleFrom(scope.querySelectorAll('label')).filter(l => l.textContent?.trim() === val);
            const inputs = new Set<Element>();
            for (const label of labels) {
              const forId = label.getAttribute('for');
              if (forId) { const inp = document.getElementById(forId); if (inp && scope.contains(inp) && isVisible(inp)) inputs.add(inp); }
              visibleFrom(label.querySelectorAll('input,select,textarea')).forEach(i => inputs.add(i));
            }
            return inputs.size;
          }

          case 'text': {
            const body = scope instanceof Document ? scope.body : scope;
            if (!body) return -1;
            let count = 0;
            for (const el of body.querySelectorAll('*')) {
              if (!isVisible(el)) continue;
              const text = (el as HTMLElement).innerText?.trim().replace(/\s+/g, ' ');
              if (text === val) count++;
            }
            return count;
          }

          case 'role': {
            const cssSel = ROLE_CSS_SELECTORS[val];
            const combined = cssSel ? `${cssSel},[role="${cssEsc(val)}"]` : `[role="${cssEsc(val)}"]`;
            const nameFilter = step.options?.name;
            const elements = visibleFrom(new Set(scope.querySelectorAll(combined)));
            if (!nameFilter) return elements.length;
            return elements.filter(el => getLiveAccessibleName(el).toLowerCase().includes(nameFilter.value.toLowerCase())).length;
          }

          default: return -1;
        }
      } catch { return -1; }
    }

    // ── Ancestor chaining ──────────────────────────────────────────────────
    const ANCESTOR_ROLE_MAP: Record<string, string> = {
      article: 'article', aside: 'complementary', dialog: 'dialog', form: 'form',
      header: 'banner', footer: 'contentinfo', main: 'main', nav: 'navigation',
      section: 'region', table: 'table', tr: 'row', td: 'cell', th: 'columnheader',
      ul: 'list', ol: 'list', li: 'listitem',
    };
    function buildAncestorStep(ancestor: Element): LocatorStep | null {
      const tag = ancestor.tagName.toLowerCase();
      const role = ancestor.getAttribute('role') ?? ANCESTOR_ROLE_MAP[tag] ?? null;
      if (role) {
        const name = getLiveAccessibleName(ancestor);
        if (name) return { kind: 'role', selectorValue: { type: 'string', value: role }, options: { name: { type: 'string', value: name } } };
        return { kind: 'role', selectorValue: { type: 'string', value: role } };
      }
      const testId = ancestor.getAttribute('data-testid') ?? ancestor.getAttribute('data-test-id');
      if (testId) return { kind: 'testId', selectorValue: { type: 'string', value: testId } };
      return null;
    }
    function findUniqueAncestor(el: Element): { ancestor: Element; step: LocatorStep } | null {
      let current = el.parentElement; let depth = 0;
      while (current && depth < 6) {
        const step = buildAncestorStep(current);
        if (step && countStepMatches(step) === 1) return { ancestor: current, step };
        current = current.parentElement; depth++;
      }
      return null;
    }

    // ── iframe detection ──────────────────────────────────────────────────
    function detectFrameInfo(): FrameInfo | null {
      if (window.self === window.top) return null;
      let frameSelector = 'iframe';
      try {
        const frameEl = window.frameElement;
        if (frameEl) {
          if (frameEl.getAttribute('name')) frameSelector = `iframe[name="${frameEl.getAttribute('name')}"]`;
          else if (frameEl.id) frameSelector = `iframe#${cssEsc(frameEl.id)}`;
          else if (frameEl.getAttribute('title')) frameSelector = `iframe[title="${cssEsc(frameEl.getAttribute('title')!)}"]`;
          else if (frameEl.getAttribute('src')) frameSelector = `iframe[src*="${(frameEl.getAttribute('src') ?? '').replace(/"/g,'').slice(0,40)}"]`;
        } else if (window.name) frameSelector = `iframe[name="${window.name}"]`;
        else frameSelector = `iframe[src*="${new URL(window.location.href).hostname}"]`;
      } catch { frameSelector = window.name ? `iframe[name="${window.name}"]` : 'iframe'; }
      return { frameSelector, frameUrl: window.location.href };
    }

    // ── Build full scored pick ─────────────────────────────────────────────
    function buildScoredPick(el: Element): StoredPick {
      const attrs = extractAttributes(el);
      const frameInfo = detectFrameInfo() ?? undefined;
      const outerHtml = safeText(el.outerHTML, 300);

      const candidateSteps = buildCandidateSteps(attrs);
      const scoredCandidates: ScoredCandidate[] = candidateSteps.map(step => ({
        step, uniqueCount: countStepMatches(step), score: 0,
      }));
      for (const c of scoredCandidates) c.score = scoreCandidate(c.step, c.uniqueCount);
      const ranked = rankCandidates(scoredCandidates);
      const bestUnique = pickBestUnique(ranked);

      let chain: LocatorChain;
      if (bestUnique) {
        chain = buildLocatorChain(attrs, ranked.map(c => ({ step: c.step, uniqueCount: c.uniqueCount })), { frameInfo });
      } else {
        const ancestorResult = findUniqueAncestor(el);
        if (ancestorResult) {
          const scopedCandidates: ScoredCandidate[] = candidateSteps.map(step => ({
            step, uniqueCount: countStepMatches(step, ancestorResult.ancestor), score: 0,
          }));
          for (const c of scopedCandidates) c.score = scoreCandidate(c.step, c.uniqueCount);
          chain = buildLocatorChain(attrs, scopedCandidates.map(c => ({ step: c.step, uniqueCount: c.uniqueCount })), { frameInfo, parentChain: { steps: [ancestorResult.step] } });
        } else {
          chain = buildLocatorChain(attrs, ranked.map(c => ({ step: c.step, uniqueCount: c.uniqueCount })), { frameInfo });
        }
      }

      return { attributes: attrs, chain, candidates: ranked, frameInfo, outerHtml, timestamp: Date.now(), url: location.href };
    }
  },
});
