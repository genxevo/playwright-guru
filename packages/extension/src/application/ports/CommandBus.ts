/**
 * Playwright Guru — CommandBus port (WS0).
 * ---------------------------------------------------------------------------
 * How the application layer asks a page to do something, without knowing that
 * `chrome.runtime` or `chrome.tabs` exist.
 *
 * Acknowledgements are TYPED and carry state. Phase 0 found the background
 * script synthesising `{ ok: true }` for messages nothing had handled — which
 * is precisely why a recorder that was never wired up appeared to work. A
 * command that reaches no handler must report `NO_HANDLER`, never success.
 */

export type CommandAckCode =
  | 'NO_HANDLER'
  | 'NO_ACTIVE_TAB'
  | 'RESTRICTED_PAGE'
  | 'NOT_INJECTED'
  | 'TAB_UNREACHABLE'
  | 'UNKNOWN';

export interface CommandAck<TState = unknown> {
  ok: boolean;
  /** Machine-oriented failure code. The UI maps it to copy. */
  code?: CommandAckCode;
  detail?: string;
  /**
   * State reported BY THE HANDLER.
   *
   * The UI derives feature state from this, never from optimistic local
   * assumption — the structural half of "never claim to be recording when we
   * are not".
   */
  state?: TState;
}

export interface CommandBus {
  send<TState = unknown>(
    command: { type: string } & Record<string, unknown>,
  ): Promise<CommandAck<TState>>;
}
