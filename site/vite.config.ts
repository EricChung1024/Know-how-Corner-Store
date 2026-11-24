import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './'：GitHub Pages 放在 /儲存庫名稱/ 底下，用相對路徑才不會找不到檔案。路由用 HashRouter，不需要伺服器設定。
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { outDir: 'dist', sourcemap: false },
  server: { port: 8000 },
});
