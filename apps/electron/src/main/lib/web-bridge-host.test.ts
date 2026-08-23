import { describe, expect, it } from 'bun:test'
import { resolveWebBridgeHost } from './web-bridge-host'

describe('web-bridge 监听地址', () => {
  it('未设置时回落回环——裸机默认不能因为容器需求而变宽', () => {
    expect(resolveWebBridgeHost({})).toBe('127.0.0.1')
    expect(resolveWebBridgeHost({ PROMA_WEB_BRIDGE_HOST: '' })).toBe('127.0.0.1')
    expect(resolveWebBridgeHost({ PROMA_WEB_BRIDGE_HOST: '   ' })).toBe('127.0.0.1')
  })

  it('显式设置时按设置绑定（容器内 0.0.0.0，靠端口只发布到宿主回环兜底）', () => {
    expect(resolveWebBridgeHost({ PROMA_WEB_BRIDGE_HOST: '0.0.0.0' })).toBe('0.0.0.0')
    expect(resolveWebBridgeHost({ PROMA_WEB_BRIDGE_HOST: ' 0.0.0.0 ' })).toBe('0.0.0.0')
  })
})
