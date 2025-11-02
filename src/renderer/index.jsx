// src/renderer/index.jsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './components/App';
import './styles/global.css';


(function setupModelOverlay() {
  const overlay = document.getElementById('model-overlay');
  const bar     = document.getElementById('model-overlay-bar');
  const detail  = document.getElementById('model-overlay-detail');
  const titleEl = document.getElementById('model-overlay-title');

  const show = () => { if (overlay) overlay.style.display = 'flex'; };
  const hide = () => { if (overlay) overlay.style.display = 'none'; };

  if (!overlay || !bar || !detail) return;

  if (window.privacyAPI?.onModelsProgress) {
    window.privacyAPI.onModelsProgress(({ file, progress }) => {
      show();
      const pct = Math.max(0, Math.min(100, Math.round((progress || 0) * 100)));
      bar.style.width = `${pct}%`;
      detail.textContent = `${pct}% — ${file || 'Downloading…'}`;
      if (progress >= 1) setTimeout(hide, 400);
    });
  }

  window.privacyAPI?.onModelsStart?.(() => {
    show();
    if (titleEl) titleEl.textContent = 'Downloading models…';
    bar.style.width = '0%';
    detail.textContent = 'Starting…';
  });

  window.privacyAPI?.onModelsDone?.(() => {
    detail.textContent = 'Done';
    setTimeout(hide, 400);
  });

  window.privacyAPI?.onModelsError?.((msg) => {
    show();
    if (titleEl) titleEl.textContent = 'Download failed';
    detail.textContent = msg || 'An error occurred while downloading models.';
  });
})();

const container = document.getElementById('root');

// Add error handling
window.onerror = function(message, source, lineno, colno, error) {
    console.error('Renderer Error:', {message, source, lineno, colno, error});
};

try {
    if (!container) {
        throw new Error('#root element not found');
    }
    const root = createRoot(container);
    root.render(
        <React.StrictMode>
            <App />
        </React.StrictMode>
    );
} catch (error) {
    console.error('Failed to render app:', error);
}