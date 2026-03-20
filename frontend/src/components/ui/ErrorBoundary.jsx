import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[400px] w-full items-center justify-center p-6">
          <div className="flex max-w-sm flex-col items-center justify-center rounded-lg border bg-card p-8 text-card-foreground shadow-sm text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-6 w-6 text-destructive" />
            </div>
            <h2 className="mt-4 text-lg font-semibold tracking-tight">Something went wrong</h2>
            <p className="mt-2 text-sm text-muted-foreground break-words max-w-full">
              {this.state.error?.message || "An unexpected error occurred."}
            </p>
            <Button
              variant="outline"
              className="mt-6"
              onClick={() => window.location.reload()}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Reload Page
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
