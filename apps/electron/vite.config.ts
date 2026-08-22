import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import pkg from './package.json' with { type: 'json' }

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  root: resolve(__dirname, 'src/renderer'),
  base: './',
  build: {
    outDir: resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@/types': resolve(__dirname, 'src/types'),
      '@': resolve(__dirname, 'src/renderer'),
      // 浏览器端复用 preload：把它 import 的 'electron' 换成 WS 替身。
      // 渲染层自身从不 import 'electron'（0 处），因此全局别名是安全的。
      electron: resolve(__dirname, 'src/web/electron-shim.ts'),
    },
  },
  server: {
    // Chromium can resolve localhost to IPv4 while Vite binds only ::1 on macOS.
    // Use the same explicit IPv4 loopback address as Electron's dev windows.
    host: '127.0.0.1',
    port: 5173,
    strictPort: true, // 确保使用指定端口，如被占用则报错
    open: false,
    fs: {
      // web-bootstrap 要加载 src/preload 与 src/web，它们在 vite root(src/renderer) 之外。
      allow: [resolve(__dirname, 'src'), resolve(__dirname, '../..')],
    },
  },
})
