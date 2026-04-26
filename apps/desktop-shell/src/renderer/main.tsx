import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import '../../../../libs/shared-ui/src/styles/theme-tokens.css';

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override render() {
    if (this.state.error) {
      return (
        <div style={{
          alignItems: 'center',
          background: '#06111d',
          color: '#e05555',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'monospace',
          fontSize: 13,
          gap: 12,
          height: '100vh',
          justifyContent: 'center',
          padding: 40,
        }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Shell crashed</div>
          <pre style={{ background: '#0c1c2c', borderRadius: 6, color: '#e0b060', fontSize: 11, maxWidth: 800, overflow: 'auto', padding: 16, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {this.state.error.message}
            {'\n\n'}
            {this.state.error.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');
createRoot(root).render(<ErrorBoundary><App /></ErrorBoundary>);
