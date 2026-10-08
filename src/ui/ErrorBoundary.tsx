import { Component, type ReactNode } from 'react';
import { logError } from '../core/errorlog';
import { t } from '../i18n';

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error): void {
    logError(error);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="screen center">
          <h2>{t('error.title')}</h2>
          <pre className="error-text">{this.state.error.message}</pre>
          <button className="btn" onClick={() => location.reload()}>
            {t('error.reload')}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
