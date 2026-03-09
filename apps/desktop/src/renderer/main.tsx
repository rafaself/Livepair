import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import { App } from './App';
import { bootstrapDesktopRenderer } from './bootstrap';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

const renderApp = (): void => {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
};

void bootstrapDesktopRenderer()
  .catch((error: unknown) => {
    console.error('Failed to bootstrap desktop renderer', error);
  })
  .finally(() => {
    renderApp();
  });
