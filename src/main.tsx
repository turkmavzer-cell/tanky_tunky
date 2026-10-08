import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { installGlobalErrorHandlers } from './core/errorlog';
import { hideSplash } from './core/platform';

installGlobalErrorHandlers();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
document.getElementById('boot')?.remove();
void hideSplash();
