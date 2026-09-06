/**
 * Error containment for a panel root.
 *
 * Before this existed, a thrown render error produced a blank panel with no
 * explanation and no way forward — the extension simply appeared to be broken.
 * That is a form of the product's central failure mode: showing the user a
 * state the product cannot account for.
 *
 * Deliberately small. It is a boundary, not a framework:
 *
 *   - No state management, no logging service, no telemetry. The privacy
 *     contract forbids sending anything anywhere, so the details go to the
 *     console, where a developer can read them.
 *   - **The error text is never rendered.** A render error can carry page
 *     content in its message (an attribute value, an accessible name, a text
 *     node), and the panel may be visible in a screen share or a screenshot.
 *     The user gets an honest, fixed explanation instead.
 *   - Recovery is a reload of the panel document, not a state reset, because
 *     after a render error the component tree cannot be trusted.
 *
 * WS8 landed the error-state matrix (`copy/errors.ts`) and deliberately did
 * NOT wire this component to it. `honesty.test.ts` pins that this boundary
 * imports react and nothing else, and that guard is right: a boundary that
 * imported a copy module could itself fail to render if that module ever threw
 * at import time, which is precisely the situation it exists to survive. The
 * matrix carries `RENDER_CRASHED` with the same title, cause and action, and
 * `error-states.test.ts` asserts the two stay in step — consistency without
 * coupling.
 */

import React from 'react';

export interface ErrorBoundaryProps {
  /** The panel this boundary protects — shown to the user, e.g. "side panel". */
  surface: string;
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Console only. Never rendered, never transmitted.
    console.error(`[PlaywrightGuru] ${this.props.surface} render error:`, error, info);
  }

  private readonly handleReload = (): void => {
    window.location.reload();
  };

  override render(): React.ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        role="alert"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          padding: 20,
          fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
          fontSize: 12,
          lineHeight: 1.5,
          color: '#334155',
          background: '#fff',
        }}
      >
        <strong style={{ fontSize: 13, color: '#991b1b' }}>
          Playwright Guru hit an unexpected error
        </strong>
        <p style={{ margin: 0 }}>
          The {this.props.surface} stopped rendering. Nothing was sent anywhere, and no data was
          lost — your saved code is still in extension storage.
        </p>
        <p style={{ margin: 0, color: '#64748b' }}>
          Reloading usually clears it. Technical details were written to this panel&apos;s console.
        </p>
        <button
          type="button"
          onClick={this.handleReload}
          style={{
            alignSelf: 'flex-start',
            padding: '6px 14px',
            border: 'none',
            borderRadius: 6,
            background: '#dc2626',
            color: '#fff',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Reload panel
        </button>
      </div>
    );
  }
}
