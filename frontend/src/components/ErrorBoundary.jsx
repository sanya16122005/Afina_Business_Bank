import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('UI error:', error, info);
    }
  }

  handleReload = () => {
    this.setState({ error: null });
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="error-boundary">
        <div className="error-boundary__card">
          <div className="error-boundary__title">Что-то пошло не так</div>
          <div className="error-boundary__hint">
            Страница не смогла отрисоваться. Попробуйте обновить — если ошибка повторится, обратитесь в поддержку.
          </div>
          {process.env.NODE_ENV !== 'production' && (
            <pre className="error-boundary__stack">{String(error?.stack || error?.message || error)}</pre>
          )}
          <button className="btn btn--primary" onClick={this.handleReload}>
            Обновить страницу
          </button>
        </div>
      </div>
    );
  }
}
