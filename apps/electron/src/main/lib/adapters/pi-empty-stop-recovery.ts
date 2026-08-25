import type { AssistantMessage } from '@earendil-works/pi-ai'

export type PiEmptyStopRecoveryResult = 'not_needed' | 'recovered' | 'exhausted' | 'aborted'

export interface PiEmptyStopRecoveryOptions {
  takePending: () => AssistantMessage | undefined
  removeFromActiveHistory: (message: AssistantMessage) => void
  continueAgent: () => Promise<void>
  isAborted: () => boolean
  wait: (delayMs: number) => Promise<void>
  onAttempt?: (attempt: number, maxRetries: number, delayMs: number) => void
  maxRetries?: number
  baseDelayMs?: number
}

/** 在同一 transcript 上有限续跑，绝不重投原始用户 prompt。 */
export async function recoverPiEmptyStops(
  options: PiEmptyStopRecoveryOptions,
): Promise<PiEmptyStopRecoveryResult> {
  let pending = options.takePending()
  if (!pending) return 'not_needed'

  const maxRetries = Math.max(0, options.maxRetries ?? 2)
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? 500)
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    options.removeFromActiveHistory(pending)
    const delayMs = baseDelayMs * attempt
    options.onAttempt?.(attempt, maxRetries, delayMs)
    await options.wait(delayMs)
    if (options.isAborted()) return 'aborted'

    await options.continueAgent()
    const next = options.takePending()
    if (!next) return 'recovered'
    pending = next
  }
  return 'exhausted'
}
