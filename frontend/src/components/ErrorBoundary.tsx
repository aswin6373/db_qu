import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

/** Last-resort boundary: a render-time crash must never blank the whole app
 *  to a white screen with no way back. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled UI error", error, info.componentStack);
  }

  private reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="grid min-h-screen place-items-center bg-cream px-4">
        <div className="w-full max-w-md rounded-2xl border border-navy/10 bg-white p-8 text-center shadow-lift">
          <h1 className="text-lg font-bold tracking-tight text-navy">Something went wrong</h1>
          <p className="mt-2 text-sm leading-6 text-navy-soft">
            The interface hit an unexpected error. Your data is safe — reloading usually fixes it.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <button className="btn-primary" onClick={this.reset} type="button">
              Try again
            </button>
            <button className="btn-secondary" onClick={() => window.location.reload()} type="button">
              Reload app
            </button>
          </div>
        </div>
      </div>
    );
  }
}
