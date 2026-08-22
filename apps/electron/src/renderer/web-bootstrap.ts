/**
 * 渲染层统一入口，桌面端与浏览器端共用一个 index.html。
 *
 * - Electron 里：preload 已经把 electronAPI 挂好了，直接进 main.tsx。
 * - 浏览器里：没有 preload，于是在这里把 preload 模块**原样跑一遍**
 *   （vite 已把它依赖的 'electron' 别名到 web/electron-shim.ts），
 *   等 WebSocket 连上再加载 main.tsx —— 应用启动瞬间就会调 electronAPI，
 *   连接没就绪就进去会丢掉首批调用。
 */

async function boot(): Promise<void> {
  // preload 已声明 window.electronAPI: ElectronAPI（非可选），浏览器里它此刻还不存在。
  if (!(window as Partial<Window>).electronAPI) {
    const { connectBridge } = await import('../web/electron-shim')
    // 先执行 preload：它会通过 shim 的 contextBridge 把 electronAPI 挂到 window。
    await import('../preload/index')
    try {
      await connectBridge()
    } catch (error) {
      document.body.innerHTML = `
        <div style="font:14px/1.6 system-ui;padding:40px;max-width:640px;margin:0 auto;color:#c00">
          <h2>无法连接 Proma 主进程</h2>
          <p>浏览器端只是主进程的第二个视图，需要主进程正在运行。</p>
          <p>请在仓库根目录执行 <code>bun run dev</code> 后刷新本页。</p>
          <pre style="white-space:pre-wrap;color:#666">${String(error)}</pre>
        </div>`
      return
    }
  }

  await import('./main')
}

void boot()

export {}
