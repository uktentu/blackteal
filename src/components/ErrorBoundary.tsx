/**
 * Error boundary.
 *
 * On a screen an operator depends on, a blank white page is the worst possible failure — worse
 * than showing stale data, because stale data is at least visibly stale. A render exception
 * anywhere below this point is caught, reported honestly, and the operator is told in plain
 * words that the display is no longer trustworthy.
 *
 * Deliberately NOT a silent retry loop: if the dashboard is broken, saying so is the safe
 * behaviour. The recover button is there because a transient render error shouldn't require
 * closing the browser, but nothing recovers automatically behind the operator's back.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';
import './errorboundary.css';

interface Props {
  children: ReactNode;
  /** Names the surface, so a failed panel doesn't read as a failed site. */
  label?: string;
}

interface State {
  error: Error | null;
  info: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ info });
    // A real deployment ships this to its error tracker; the console is the honest stand-in.
    console.error('[BlackTeal] render error', error, info.componentStack);
  }

  render() {
    const { error, info } = this.state;
    if (error === null) return this.props.children;

    return (
      <div className="boundary" role="alert">
        <div className="boundary-inner">
          <h2 className="boundary-title">
            {this.props.label ?? 'This display'} has stopped updating
          </h2>
          <p className="boundary-body">
            A rendering error occurred. <strong>Do not treat anything on this panel as live.</strong>{' '}
            Values shown before the error are not being refreshed.
          </p>

          <details className="boundary-details">
            <summary>Technical detail</summary>
            <pre className="metric">
              {error.name}: {error.message}
              {info?.componentStack ?? ''}
            </pre>
          </details>

          <div className="boundary-actions">
            <button type="button" onClick={() => this.setState({ error: null, info: null })}>
              Try to recover
            </button>
            <button type="button" onClick={() => window.location.reload()}>
              Reload dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }
}
