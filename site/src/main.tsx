import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import './styles/tokens.css';
import './styles/components.css';
import './styles/brand.css';
import './styles/app.css';
import './styles/react.css';
import App from './App';
import { AuthProvider, ModalProvider, NavProvider, ToastProvider } from './lib/hooks';

// 不用 StrictMode：開發模式下它會讓 effect 跑兩次，「一鍵匯入」這類會寫資料的動作會被執行兩次。
createRoot(document.getElementById('root')!).render(
  <HashRouter>
    <AuthProvider><ToastProvider><ModalProvider><NavProvider><App /></NavProvider></ModalProvider></ToastProvider></AuthProvider>
  </HashRouter>,
);
