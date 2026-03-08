import React from 'react';

type ErrorBoundaryState = {
  hasError: boolean;
  message?: string;
};

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Leaf UI crashed:', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="error-boundary">
        <div className="error-boundary-card acrylic">
          <div className="error-boundary-title">Something went wrong</div>
          <div className="error-boundary-subtitle">
            The app hit an unexpected error. Reload to continue.
          </div>
          {this.state.message && (
            <div className="error-boundary-message">{this.state.message}</div>
          )}
          <button className="error-boundary-button" onClick={() => window.location.reload()}>
            Reload App
          </button>
        </div>
        <style>{`
          .error-boundary {
            width: 100vw;
            height: 100dvh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
          }
          .error-boundary-card {
            max-width: 520px;
            width: 100%;
            padding: 28px;
            border-radius: var(--radius-lg);
            display: flex;
            flex-direction: column;
            gap: 12px;
            text-align: center;
          }
          .error-boundary-title {
            font-family: var(--font-display);
            font-size: 24px;
            font-weight: 600;
            color: var(--color-text-1);
          }
          .error-boundary-subtitle {
            font-size: var(--text-sm);
            color: var(--color-text-3);
          }
          .error-boundary-message {
            font-size: var(--text-xs);
            color: var(--color-text-4);
            background: var(--color-surface-2);
            border: 1px solid var(--color-border);
            border-radius: var(--radius-md);
            padding: 8px 10px;
            word-break: break-word;
          }
          .error-boundary-button {
            margin-top: 6px;
            align-self: center;
            border: none;
            padding: 8px 18px;
            border-radius: var(--radius-full);
            background: var(--color-accent);
            color: #fff;
            font-weight: 600;
            cursor: pointer;
            transition: transform var(--dur-fast), box-shadow var(--dur-fast), background-color var(--dur-fast);
            box-shadow: 0 8px 18px var(--color-accent-light);
          }
          .error-boundary-button:hover {
            transform: translateY(-1px);
            box-shadow: 0 10px 22px var(--color-accent-light);
            background: var(--color-accent-hover);
          }
        `}</style>
      </div>
    );
  }
}
