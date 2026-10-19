import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('No se encontró el elemento raíz de la aplicación.');
}

const path = window.location.pathname;
const isOneTimeLinkRoute = path === '/accept-invitation' || path === '/reset-password';
const initialAuthHash = isOneTimeLinkRoute ? window.location.hash : '';
if (initialAuthHash) {
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
}

createRoot(rootElement).render(
  <StrictMode>
    <App initialAuthHash={initialAuthHash} />
  </StrictMode>,
);
