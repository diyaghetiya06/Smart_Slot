import { Component } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("[ErrorBoundary]", error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex min-h-[60vh] items-center justify-center p-8">
        <div className="max-w-md rounded-xl border bg-card p-8 text-center shadow-sm space-y-4">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-destructive/10">
            <AlertTriangle className="w-7 h-7 text-destructive" />
          </div>
          <h2 className="text-lg font-semibold">Something went wrong</h2>
          <p className="text-sm text-muted-foreground">
            An unexpected error occurred. The team has been notified. Reload
            the page or go back to the dashboard.
          </p>
          {this.state.error && (
            <pre className="text-left rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground overflow-auto max-h-32">
              {this.state.error.message}
            </pre>
          )}
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <RefreshCw className="w-4 h-4" />
              Reload page
            </button>
            <a
              href="/"
              className="inline-flex items-center rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Go to dashboard
            </a>
          </div>
        </div>
      </div>
    );
  }
}
