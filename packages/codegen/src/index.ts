import type { LocatorChain } from '@playwright-guru/locator-engine';
import { renderTypeScript } from './renderers/typescript';
import { renderPython }     from './renderers/python';
import { renderJava }       from './renderers/java';
import { renderCSharp }     from './renderers/csharp';

export type TargetLanguage =
  | 'typescript'
  | 'javascript'
  | 'python_sync'
  | 'python_async'
  | 'java'
  | 'csharp_sync'
  | 'csharp_async';

/**
 * Renders a canonical LocatorChain into idiomatic source code for the
 * requested target language.
 *
 * If the chain carries a `frameSelector`, the output is automatically
 * prefixed with the appropriate language-specific `frameLocator()` call.
 */
export function generateLocatorCode(chain: LocatorChain, lang: TargetLanguage): string {
  const locatorCode = renderLocator(chain, lang);
  if (!chain.frameSelector) return locatorCode;
  return prependFrameLocator(locatorCode, chain.frameSelector, lang);
}

function renderLocator(chain: LocatorChain, lang: TargetLanguage): string {
  switch (lang) {
    case 'typescript':
    case 'javascript':
      return renderTypeScript(chain);
    case 'python_sync':
      return renderPython(chain, false);
    case 'python_async':
      return renderPython(chain, true);
    case 'java':
      return renderJava(chain);
    case 'csharp_sync':
    case 'csharp_async':
      return renderCSharp(chain);
    default: {
      const _exhaustive: never = lang;
      throw new Error(`Unsupported language: ${_exhaustive}`);
    }
  }
}

/**
 * Prepends a language-specific `frameLocator()` call to the locator code.
 * All renderers root their output at `page.` / `Page.`, so a simple
 * prefix replacement is safe and reliable.
 */
function prependFrameLocator(
  code: string,
  frameSelector: string,
  lang: TargetLanguage
): string {
  switch (lang) {
    case 'typescript':
    case 'javascript': {
      const esc = frameSelector.replace(/'/g, "\\'");
      return code.replace(/^page\./, `page.frameLocator('${esc}').`);
    }
    case 'python_sync':
    case 'python_async': {
      const esc = frameSelector.replace(/"/g, '\\"');
      return code.replace(/^page\./, `page.frame_locator("${esc}").`);
    }
    case 'java': {
      const esc = frameSelector.replace(/"/g, '\\"');
      return code.replace(/^page\./, `page.frameLocator("${esc}").`);
    }
    case 'csharp_sync':
    case 'csharp_async': {
      const esc = frameSelector.replace(/"/g, '\\"');
      return code.replace(/^Page\./, `Page.FrameLocator("${esc}").`);
    }
  }
}

// Re-export types so consumers can import everything from a single entry point
export type {
  LocatorChain,
  LocatorStep,
  LocatorKind,
  LocatorStepOptions,
  LocatorStateOptions,
  LocatorFilter,
  MatcherValue,
  ElementAttributes,
  FrameInfo,
  ScoredCandidate,
} from '@playwright-guru/locator-engine';
