// src/renderer/index.jsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './components/App';
import './styles/global.css';

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