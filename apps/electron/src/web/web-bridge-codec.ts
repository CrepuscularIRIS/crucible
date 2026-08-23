const UNDEFINED_MARKER = '__proma_web_bridge_undefined_7f0af1ef__'

interface UndefinedWireValue {
  [UNDEFINED_MARKER]: true
}

function isUndefinedWireValue(value: unknown): value is UndefinedWireValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return record[UNDEFINED_MARKER] === true && Object.keys(record).length === 1
}

function restoreUndefined(value: unknown): unknown {
  if (isUndefinedWireValue(value)) return undefined
  if (Array.isArray(value)) return value.map(restoreUndefined)
  if (!value || typeof value !== 'object') return value
  const restored: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) restored[key] = restoreUndefined(child)
  return restored
}

/** JSON 默认把数组里的 undefined 变成 null，会破坏 Electron IPC 的可选参数语义。 */
export function serializeWebBridgeMessage(value: unknown): string {
  const encoded = JSON.stringify(value, (_key, child: unknown) => (
    child === undefined ? { [UNDEFINED_MARKER]: true } : child
  ))
  if (encoded === undefined) throw new Error('web-bridge 消息无法序列化')
  return encoded
}

export function parseWebBridgeMessage(text: string): unknown {
  return restoreUndefined(JSON.parse(text) as unknown)
}
