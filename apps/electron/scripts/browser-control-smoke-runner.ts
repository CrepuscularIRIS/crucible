/** bun run apps/electron/scripts/browser-control-smoke-runner.ts；Linux 需要 xvfb-run。 */
import { build } from 'esbuild'
import { createServer } from 'node:net'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = mkdtempSync(join(tmpdir(), 'proma-browser-smoke-'))
const outfile = join(root, 'smoke.cjs')
await build({
  entryPoints: [resolve(import.meta.dir, 'browser-control-smoke.ts')],
  bundle: true, platform: 'node', format: 'cjs', outfile, external: ['electron'],
  plugins: [{
    name: 'isolated-settings',
    setup(builder) {
      // 只替换设置读取；真实 Electron、Controller、URL 检查与 CDP 均照常执行。
      builder.onLoad({ filter: /[/\\]settings-service\.ts$/ }, () => ({
        contents: "export function getSettings() { return { browserRiskDisclaimerVersion: process.env.PROMA_BROWSER_SMOKE_ACK === '1' ? 1 : 0 } }",
        loader: 'ts',
      }))
    },
  }],
})
const electron = resolve(import.meta.dir, '../node_modules/electron/dist/electron')
const args = [electron, ...(process.getuid?.() === 0 ? ['--no-sandbox'] : []), outfile]
const portProbe = createServer()
await new Promise<void>((resolve) => portProbe.listen(0, '127.0.0.1', resolve))
const address = portProbe.address()
if (!address || typeof address === 'string') throw new Error('无法分配测试端口')
await new Promise<void>((resolve) => portProbe.close(() => resolve()))
const child = Bun.spawn(process.platform === 'linux' ? ['xvfb-run', '-a', ...args] : args, {
  env: { ...process.env, PROMA_BROWSER_SMOKE_DIR: root, PROMA_WEB_BRIDGE_PORT: String(address.port), PROMA_WEB_BRIDGE_HOST: '127.0.0.1', PROMA_BROWSER_SMOKE_ACK: '0', PROMA_BROWSER_OFFSCREEN: '1', ELECTRON_RUN_AS_NODE: '' },
  stdout: 'inherit', stderr: 'inherit',
})
process.exit(await child.exited)
