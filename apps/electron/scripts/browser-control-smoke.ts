/** 由 browser-control-smoke-runner.ts 在隔离 Electron 中执行，网页仅来自本地测试服务器。 */
import { app, BrowserWindow, nativeImage } from 'electron'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { writeFileSync } from 'node:fs'
import WebSocket from 'ws'
import type { BrowserPagePreview } from '@proma/shared'
import { AGENT_IPC_CHANNELS } from '@proma/shared'
import { registerBrowserPreviewIpc } from '../src/main/lib/browser-preview-ipc'
import { patchIpcMainForWeb, startWebBridge, stopWebBridge } from '../src/main/lib/web-bridge'
import { BrowserController } from '../src/main/lib/browser-controller'

const root = process.env.PROMA_BROWSER_SMOKE_DIR
if (!root) throw new Error('必须由隔离测试 runner 启动')
app.setPath('userData', join(root, 'electron-profile'))
app.disableHardwareAcceleration()
const controller = new BrowserController()
const server = createServer((_req, response) => {
  response.setHeader('Content-Type', 'text/html; charset=utf-8')
  response.end(`<!doctype html><html lang="zh"><title>浏览器接入验收</title>
    <body style="background:#eaf2ff;color:#172b4d;font:24px sans-serif;padding:48px">
    <h1>Agent 浏览器验收</h1><label>研究问题 <input aria-label="研究问题" id="question"></label>
    <button onclick="document.getElementById('result').textContent='已收到：'+document.getElementById('question').value">提交问题</button>
    <p id="result" role="status">等待输入</p></body></html>`)
})
let checks = 0
function passed(message: string): void { checks += 1; console.log(`PASS ${checks}: ${message}`) }

void app.whenReady().then(async () => {
  app.on('web-contents-created', (_event, contents) => {
    contents.on('render-process-gone', (_e, details) => console.error('RENDERER', details))
    contents.on('did-fail-load', (_e, code, description) => console.error('LOAD', code, description))
  })
  const owner = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { sandbox: true } })
  controller.setOwnerWindow(owner)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert(address && typeof address !== 'string')
  const url = `http://127.0.0.1:${address.port}/`
  try {
    await assert.rejects(controller.navigate('agent-smoke', url), /风险告知/)
    await assert.rejects(controller.preview('agent-smoke', 'missing'), /风险告知/)
    passed('Given 未确认 When Agent 导航或面板截图 Then 阻止访问')
    // 此开关仅由 runner 的 settings-service 测试替身读取，不修改用户设置。
    process.env.PROMA_BROWSER_SMOKE_ACK = '1'
    await controller.navigate('agent-smoke', url)
    const observation = await controller.observe('agent-smoke')
    const input = observation.elements.find((element) => element.name === '研究问题' && element.editable)
    const button = observation.elements.find((element) => element.name === '提交问题' && element.role === 'button')
    assert(input && button, JSON.stringify(observation))
    passed('Given 有效页面 When 导航并 Observe Then 取得真实字段和按钮引用')
    const beforeClick = await controller.screenshot('agent-smoke')
    await controller.evaluate('agent-smoke', 'window.requestAnimationFrame = () => 0; true')
    await controller.preview('agent-smoke', observation.tabId)
    await controller.fill('agent-smoke', input.ref, '可证伪的假设')
    await controller.click('agent-smoke', button.ref)
    assert.equal((await controller.waitFor('agent-smoke', { kind: 'text', value: '已收到：可证伪的假设' }, 1000)).matched, true)
    const result = await controller.evaluate('agent-smoke', "document.getElementById('result').textContent")
    assert.equal(result.result, '已收到：可证伪的假设')
    passed('Given Observe 引用 When Fill 与 Click Then 页面实际收到输入并产生结果')
    const screenshot = await controller.screenshot('agent-smoke')
    const image = nativeImage.createFromBuffer(Buffer.from(screenshot.base64, 'base64'))
    assert.equal(image.isEmpty(), false)
    assert(image.getSize().width >= 800 && image.getSize().height >= 600)
    // 既要有尺寸，也不能只返回一张空白的 PNG。
    const pixels = image.toBitmap()
    assert(new Set(pixels).size > 20)
    const beforeImage = nativeImage.createFromBuffer(Buffer.from(beforeClick.base64, 'base64'))
    const resultRegion = { x: 0, y: 230, width: 800, height: 80 }
    assert(!image.crop(resultRegion).toPNG().equals(beforeImage.crop(resultRegion).toPNG()), '点击后截图不能仍显示旧结果')
    writeFileSync(join(root, 'agent-page.png'), image.toPNG())
    passed('Given 未挂载原生 Slot When Agent 截图 Then 得到有内容的页面')
    const agentTabId = controller.getState('agent-smoke')!.agentTabId!
    const display = await controller.createDisplayTab('agent-smoke', `${url}?user=1`)
    const before = controller.getState('agent-smoke')!
    const preview = await controller.preview('agent-smoke', display.activeTabId)
    assert.equal(preview.url, `${url}?user=1`)
    assert.equal(preview.tabId, display.activeTabId)
    assert.equal(preview.sessionId, 'agent-smoke')
    const after = controller.getState('agent-smoke')!
    assert.equal(after.agentTabId, agentTabId)
    assert.deepEqual(after.trace, before.trace)
    assert.equal((await controller.observe('agent-smoke')).tabId, agentTabId)
    patchIpcMainForWeb()
    registerBrowserPreviewIpc(controller, async (senderId, sessionId) => {
      assert.equal(senderId, owner.webContents.id)
      if (sessionId !== 'agent-smoke') throw new Error('会话未授权')
    })
    startWebBridge(() => owner)
    const socket = new WebSocket(`ws://127.0.0.1:${process.env.PROMA_WEB_BRIDGE_PORT}`)
    await new Promise<void>((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject) })
    let requestId = 0
    const invokePreview = (input: unknown): Promise<BrowserPagePreview> => new Promise((resolve, reject) => {
      const id = ++requestId
      const onMessage = (raw: WebSocket.RawData): void => {
        const reply = JSON.parse(String(raw)) as { id?: number; error?: string; result: BrowserPagePreview }
        if (reply.id !== id) return
        socket.off('message', onMessage)
        if (reply.error) reject(new Error(reply.error))
        else resolve(reply.result)
      }
      socket.on('message', onMessage)
      socket.send(JSON.stringify({ type: 'invoke', id, channel: AGENT_IPC_CHANNELS.GET_BROWSER_PREVIEW, args: [input] }))
    })
    const bridged = await invokePreview({ sessionId: 'agent-smoke', tabId: display.activeTabId })
    assert.equal(bridged.tabId, display.activeTabId)
    assert(bridged.base64.length > 0)
    await assert.rejects(invokePreview(null), /无效/)
    await assert.rejects(invokePreview({ sessionId: 'unauthorized', tabId: display.activeTabId }), /未授权/)
    await assert.rejects(invokePreview({ sessionId: 'agent-smoke', tabId: 'missing' }), /不存在/)
    socket.close()
    stopWebBridge()
    passed('Given Web 桥 When 调用真实快照 IPC Then 正常返回且拒绝无效参数、未授权会话和未知标签')
    passed('Given 用户查看另一标签 When 快照刷新 Then 不改变 Agent 目标且不伪造操作账本')
    controller.minimize('agent-smoke')
    const hidden = await controller.screenshot('agent-smoke')
    assert(nativeImage.createFromBuffer(Buffer.from(hidden.base64, 'base64')).getSize().width > 0)
    passed('Given 面板最小化 When Agent 继续截图 Then 保留可用后台页面')
    await assert.rejects(controller.preview('agent-smoke', 'missing'), /标签不存在/)
    await controller.closeTab('agent-smoke', display.activeTabId)
    await assert.rejects(controller.preview('agent-smoke', display.activeTabId), /标签不存在/)
    await controller.evaluate('agent-smoke', `window.open(${JSON.stringify(url + '?popup=1')}, '_blank'); true`)
    const popup = controller.getState('agent-smoke')!.tabs.find((tab) => tab.openedByPopup)
    assert(popup, 'popup 必须保留为受管标签')
    await controller.navigate('agent-smoke', url + '?popup=1', popup.tabId)
    assert((await controller.observe('agent-smoke', popup.tabId)).elements.length > 0)
    const popupContents = BrowserWindow.getAllWindows().find((window) => window.webContents.getURL() === url + '?popup=1')?.webContents
    assert(popupContents)
    assert.equal(popupContents.getBackgroundThrottling(), false)
    const popupShot = await controller.preview('agent-smoke', popup.tabId)
    assert(new Set(nativeImage.createFromBuffer(Buffer.from(popupShot.base64, 'base64')).toBitmap()).size > 20)
    await controller.closeTab('agent-smoke', agentTabId)
    assert(!controller.getState('agent-smoke')?.tabs.some((tab) => tab.tabId === popup.tabId))
    passed('Given 页面打开子窗口 When Agent 读取并关闭父标签 Then 子窗口可用且一起回收')
    await controller.close('agent-smoke')
    await assert.rejects(controller.preview('agent-smoke', agentTabId), /已关闭/)
    assert.equal(controller.getState('agent-smoke'), null)
    passed('Given 标签或会话已关闭 When 晚到快照请求 Then 拒绝且不重新创建')
    assert.equal(BrowserWindow.getAllWindows().length, 1, '关闭标签后不能遗留离屏窗口')
    process.env.PROMA_BROWSER_OFFSCREEN = '0'
    owner.show()
    const desktop = controller.listTabs('desktop-smoke')
    controller.setLayout({ sessionId: 'desktop-smoke', tabId: desktop.activeTabId, revision: 1, visible: true, bounds: { x: 0, y: 0, width: 1200, height: 700 } })
    await controller.navigate('desktop-smoke', url)
    const desktopShot = await controller.screenshot('desktop-smoke')
    assert(!nativeImage.createFromBuffer(Buffer.from(desktopShot.base64, 'base64')).isEmpty())
    assert.equal(controller.getState('desktop-smoke')!.visible, true)
    controller.minimize('desktop-smoke')
    const desktopHiddenShot = await controller.screenshot('desktop-smoke')
    assert(new Set(nativeImage.createFromBuffer(Buffer.from(desktopHiddenShot.base64, 'base64')).toBitmap()).size > 20)
    await controller.close('desktop-smoke')
    passed('Given 桌面模式 When 原生 Slot 展示 Then 保留真实原生页面和截图能力')
    console.log(`BROWSER_SMOKE_OK ${checks} checks; ${root}/agent-page.png`)
    app.exit(0)
  } catch (error) {
    console.error(error)
    app.exit(1)
  } finally {
    server.close()
  }
}).catch((error: unknown) => { console.error(error); app.exit(1) })
setTimeout(() => { console.error('浏览器验收超过 60 秒'); app.exit(1) }, 60_000).unref()
