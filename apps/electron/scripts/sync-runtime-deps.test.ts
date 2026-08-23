import { afterEach, describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EXTERNAL_RUNTIME_PACKAGES, resolvePackageFromBunStore } from './sync-runtime-deps'

const tempRoots: string[] = []

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('运行时依赖同步', () => {
  it('Prime 外置包按依赖拓扑同步，避免子依赖先占顶层位置', () => {
    expect(EXTERNAL_RUNTIME_PACKAGES.slice(0, 3)).toEqual([
      '@earendil-works/pi-ai',
      '@earendil-works/pi-agent-core',
      '@earendil-works/pi-coding-agent',
    ])
  })

  it('普通 hoist 缺失时可从 Bun 隔离虚拟仓库解析 scoped file dependency', () => {
    const store = mkdtempSync(join(tmpdir(), 'proma-bun-store-'))
    tempRoots.push(store)
    const packageDir = join(
      store,
      '@earendil-works+pi-coding-agent@file+prime-agent+abc123',
      'node_modules/@earendil-works/pi-coding-agent',
    )
    mkdirSync(packageDir, { recursive: true })
    writeFileSync(join(packageDir, 'package.json'), '{"name":"@earendil-works/pi-coding-agent"}')

    expect(resolvePackageFromBunStore(store, '@earendil-works/pi-coding-agent')).toBe(packageDir)
  })

  it('不会把同 scope 的其他包误当成目标包', () => {
    const store = mkdtempSync(join(tmpdir(), 'proma-bun-store-'))
    tempRoots.push(store)
    const otherDir = join(
      store,
      '@earendil-works+pi-ai@file+prime-agent+abc123',
      'node_modules/@earendil-works/pi-ai',
    )
    mkdirSync(otherDir, { recursive: true })
    writeFileSync(join(otherDir, 'package.json'), '{"name":"@earendil-works/pi-ai"}')

    expect(resolvePackageFromBunStore(store, '@earendil-works/pi-coding-agent')).toBeUndefined()
  })
})
