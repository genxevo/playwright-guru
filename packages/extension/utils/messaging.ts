import type { ElementAttributes, FrameInfo, ScoredCandidate, LocatorChain } from '@playwright-guru/locator-engine';

export type { ElementAttributes, FrameInfo, ScoredCandidate, LocatorChain };

// ─── Messages ─────────────────────────────────────────────────────────────

export interface ActivatePickerMessage {
  type: 'ACTIVATE_PICKER';
  /** Tab to send to — resolved by the side panel before messaging the background. */
  targetTabId?: number;
}
export interface DeactivatePickerMessage {
  type: 'DEACTIVATE_PICKER';
  targetTabId?: number;
}
export interface VerifySelectorMessage {
  type: 'VERIFY_SELECTOR';
  selector: string;
  /** 'css' or 'xpath' — determines which query API to use in the content script. */
  selectorType: 'css' | 'xpath';
  targetTabId: number;
}

export type RuntimeMessage =
  | StartRecordingMessage
  | StopRecordingMessage
  | ActivatePickerMessage
  | DeactivatePickerMessage
  | VerifySelectorMessage;

export interface RuntimeMessageAck {
  ok: boolean;
  error?: string;
  /** Number of DOM elements matched — populated for VERIFY_SELECTOR responses. */
  count?: number;
}

// ─── Storage schema ────────────────────────────────────────────────────────

export interface StoredPick {
  attributes: ElementAttributes;
  chain: LocatorChain;
  candidates: ScoredCandidate[];
  frameInfo?: FrameInfo;
  /** First 300 chars of the element's outerHTML, for display in the panel. */
  outerHtml?: string;
  timestamp: number;
  url: string;
}

// ─── Recording ──────────────────────────────────────────────────────────────

export type RecordedActionKind =
  | 'goto' | 'click' | 'dblclick'
  | 'fill' | 'check' | 'uncheck'
  | 'selectOption';

export interface RecordedAction {
  kind:      RecordedActionKind;
  attrs?:    ElementAttributes;   // undefined only for 'goto'
  value?:    string;              // fill value or selectOption value
  url?:      string;              // goto url
  timestamp: number;
}

export interface StartRecordingMessage { type: 'START_RECORDING'; targetTabId?: number }
export interface StopRecordingMessage  { type: 'STOP_RECORDING';  targetTabId?: number }
