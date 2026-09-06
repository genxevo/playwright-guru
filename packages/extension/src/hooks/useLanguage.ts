/**
 * WS5 — the target-language preference, one hook for both surfaces.
 *
 * WS4 already made this a validated global (`PW_LANG`); before WS5 only the
 * Side Panel used it and the DevTools panel kept its own `useState`, so
 * switching language in one surface left the other on TypeScript. Reading and
 * writing through the same descriptor is what makes the preference a
 * preference rather than a per-window accident.
 */
import { useCallback, useEffect, useState } from 'react';

import { PW_LANG } from '../storage/state';

import type { StorageGateway } from '../application/ports/StorageGateway';
import type { PwLang } from '../ui/panel/types';

export type LanguageGateway = Pick<StorageGateway, 'readGlobal' | 'writeGlobal' | 'watch'>;

export function useLanguage(gateway: LanguageGateway): [PwLang, (next: PwLang) => void] {
  /**
   * WS9 DL-85 — the casts are gone, and their absence is the fix.
   *
   * `PW_LANG` stored its own five-member vocabulary while this hook wrote the
   * seven-member `TargetLanguage` the panels actually offer, and `as
   * StoredLanguage` is what stopped the compiler from saying so. `writeGlobal`
   * validates on the way in, so `python_sync` and `csharp_async` were refused
   * with `INVALID_VALUE` and the preference silently did not persist. The
   * descriptor now speaks one vocabulary, so `StoredLanguage` IS `PwLang` and
   * no cast is needed anywhere in this file.
   */
  const [lang, setLang] = useState<PwLang>(PW_LANG.defaultValue);

  useEffect(() => {
    let cancelled = false;
    void gateway.readGlobal(PW_LANG).then((read) => {
      if (!cancelled) setLang(read.value);
    });
    const stop = gateway.watch(PW_LANG, null, (value) => setLang(value));
    return () => {
      cancelled = true;
      stop();
    };
  }, [gateway]);

  const choose = useCallback(
    (next: PwLang) => {
      setLang(next);
      void gateway.writeGlobal(PW_LANG, next);
    },
    [gateway],
  );

  return [lang, choose];
}
