import React from 'react';
import ReactDOM from 'react-dom/client';

// Tauri 模式下引入 IPC 替换层，将 window.syncFile 替换为 Tauri API
import './lib/tauri-api';

import { App } from './App';
import './App.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
