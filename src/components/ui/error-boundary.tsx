import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  fallback?: ReactNode;
  children: ReactNode;
  onError?: (error: Error, errorInfo: string) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

function DefaultFallback({
  error,
  onRetry,
}: {
  error: Error | null;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="rounded-[12px] border border-red-300 bg-red-50 p-4 text-center"
    >
      <p className="font-semibold text-red-700">Something went wrong</p>
      {error && <p className="mt-1 text-sm text-red-600">{error.message}</p>}
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 inline-flex items-center justify-center rounded-[12px] bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
      >
        Try again
      </button>
    </div>
  );
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const { onError } = this.props;
    if (onError) {
      onError(error, errorInfo.componentStack ?? '');
    }
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <DefaultFallback error={this.state.error} onRetry={this.handleRetry} />
      );
    }
    return this.props.children;
  }
}

export { ErrorBoundary };
export type { ErrorBoundaryProps };
