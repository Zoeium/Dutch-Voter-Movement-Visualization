import {Component, type ErrorInfo, type ReactNode} from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches render-time failures (e.g. a malformed election resource throwing
 * inside a loader invoked during render) and shows a diagnostic instead of a
 * permanently blank page.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {error: null};

  /** Store a render failure so the fallback screen can display it. */
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {error};
  }

  /** Log render failures with their React component stack. */
  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[app] Failed to render the application', error, errorInfo);
  }

  /** Render either the application children or a diagnostic fallback. */
  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center p-6">
          <div className="max-w-xl text-center">
            <h1 className="text-xl font-bold mb-2">Something went wrong</h1>
            <p className="text-sm text-gray-400 break-words">{this.state.error.message}</p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
