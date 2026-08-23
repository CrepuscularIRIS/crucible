import { describe, expect, it } from 'bun:test'
import { parseWebBridgeMessage, serializeWebBridgeMessage } from './web-bridge-codec'

describe('web bridge 编解码', () => {
  it('保留参数数组与对象里的 undefined，不能在 JSON 传输中退化成 null', () => {
    const message = {
      type: 'invoke',
      channel: 'planning:list-todos',
      args: [undefined, { optional: undefined, present: null }],
    }
    expect(parseWebBridgeMessage(serializeWebBridgeMessage(message))).toEqual(message)
  })
})
