import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  /** What the player calls this part of the screen ("The checklist"). */
  name: string;
  children: ReactNode;
  /** Close the panel (offered alongside Try again). */
  onClose?: () => void;
  /** Render as a floating panel (default) or inline. */
  inline?: boolean;
}

interface State {
  error: Error | null;
}

/**
 * One broken panel never takes down the game: it shows what failed and offers to
 * try again (or close), while the map, clock, and saves keep working.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[${this.props.name}]`, error, info.componentStack);
  }

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const id = this.props.name.toLowerCase().replace(/[^a-z]+/g, '-');
    return (
      <div className={this.props.inline ? 'panel-error inline' : 'panel panel-error'} role="alert" data-testid={`error-${id}`}>
        <strong>{this.props.name} ran into a problem.</strong>
        <p>{error.message || String(error)}</p>
        <p className="muted small">The rest of the game is still running, and your autosave is untouched.</p>
        <div className="row-actions">
          <button className="btn" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
          {this.props.onClose && (
            <button
              className="btn ghost"
              onClick={() => {
                this.setState({ error: null });
                this.props.onClose?.();
              }}
            >
              Close
            </button>
          )}
        </div>
        <details>
          <summary>Details for a bug report</summary>
          <pre className="cli">{error.stack ?? String(error)}</pre>
        </details>
      </div>
    );
  }
}
