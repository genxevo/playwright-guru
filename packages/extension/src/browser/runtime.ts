/**
 * WS5 — the one runtime-messaging seam (D-g / O6).
 *
 * The Side Panel used `browser.runtime.sendMessage` (`wxt/browser`) and the
 * DevTools panel used the raw `chrome.runtime.sendMessage`, in three places
 * (DL-67, D-g). They did the same thing, and both then called `normalizeAck` —
 * except that each remembered to do so in its own way, which is precisely how a
 * missing ack becomes a silent success again.
 *
 * This module is where that call lives now. It is NOT a CommandBus and must not
 * become one: no command registry, no typed dispatch table, no second protocol.
 * It is the existing `browser.runtime.sendMessage` + the existing
 * `normalizeAck`, in the one directory R1 permits browser APIs, so that code
 * outside that directory can reach the seam through a function instead of
 * reaching for `chrome`. DL-54's `CommandBus`-is-redundant decision stays
 * locked.
 */
import { browser } from 'wxt/browser';

import { normalizeAck } from '../../utils/messaging';

import type { RuntimeMessage, RuntimeMessageAck } from '../../utils/messaging';

/**
 * Send a message to the background and get a normalised ack back.
 *
 * A rejected send is a failed ack, not a thrown exception: every caller in this
 * codebase wants to render the failure, and an exception is the shape that gets
 * dropped by a `void` call.
 */
export async function sendRuntimeMessage(message: RuntimeMessage): Promise<RuntimeMessageAck> {
  try {
    const response = (await browser.runtime.sendMessage(message)) as RuntimeMessageAck | undefined;
    return normalizeAck(response);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
