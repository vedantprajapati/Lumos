import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

const formatArgs = (args) => args.map(a => {
    try {
        return typeof a === 'object' ? JSON.stringify(a) : String(a);
    } catch (e) {
        return String(a);
    }
}).join(' ');

console.log = (...args) => {
    originalLog(...args);
    if (window.electronAPI && window.electronAPI.sendConsoleLog) {
        window.electronAPI.sendConsoleLog('info', formatArgs(args));
    }
};

console.warn = (...args) => {
    originalWarn(...args);
    if (window.electronAPI && window.electronAPI.sendConsoleLog) {
        window.electronAPI.sendConsoleLog('warn', formatArgs(args));
    }
};

console.error = (...args) => {
    originalError(...args);
    if (window.electronAPI && window.electronAPI.sendConsoleLog) {
        window.electronAPI.sendConsoleLog('error', formatArgs(args));
    }
};

window.addEventListener('error', (e) => {
    if (window.electronAPI && window.electronAPI.sendConsoleLog) {
        window.electronAPI.sendConsoleLog('uncaught-exception', `${e.message} at ${e.filename}:${e.lineno}:${e.colno}`);
    }
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
