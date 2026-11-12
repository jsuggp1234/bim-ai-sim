import { defineConfig } from 'vite';

// GitHub Pages(하위 경로)에서도 동작하도록 상대 경로로 빌드
export default defineConfig({
  base: './',
  worker: { format: 'es' },
  build: { target: 'es2020', chunkSizeWarningLimit: 900 },
});
