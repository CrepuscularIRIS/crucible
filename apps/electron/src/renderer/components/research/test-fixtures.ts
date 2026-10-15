/** 测试夹具：从仓库归档读 run 目录（node:fs + node:crypto），只给 bun test 用，渲染层不 import */
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { parseBundle, type ResearchRecord } from '@proma/shared/research-record'

const CAMPAIGNS = resolve(import.meta.dir, '../../../../../../research/campaigns')
export const ONE_DIR = join(CAMPAIGNS, '2026-10-14-glm53flash-oneline-ca_rebound')
export const P0R_DIR = join(CAMPAIGNS, '2026-10-14-glm53flash-p0-oneline-ca_rebound')
/** 2026-10-15 GLM 交付 run：ledger.md 中途写坏，状态只能从 journal 推 */
export const DELIVERY_DIR = join(CAMPAIGNS, '2026-10-15-glm53flash-delivery-oneline-ca_rebound')

export function readBundle(dir: string): Record<string, string> {
  const files: Record<string, string> = {}
  const walk = (d: string): void => {
    for (const name of readdirSync(d)) {
      const p = join(d, name)
      if (statSync(p).isDirectory()) walk(p)
      else files[relative(dir, p)] = readFileSync(p, 'utf8')
    }
  }
  walk(dir)
  return files
}

export const loadRecord = (dir: string): ResearchRecord =>
  parseBundle(readBundle(dir), { sha256: (s) => createHash('sha256').update(s).digest('hex') })
