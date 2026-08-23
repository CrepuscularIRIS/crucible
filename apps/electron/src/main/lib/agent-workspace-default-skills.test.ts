import { lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'bun:test'
import { managedSkillPathExists, safeReplaceSkillDir, shouldReplaceManagedSkill } from './agent-workspace-manager'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'proma-managed-skill-'))
  roots.push(root)
  return root
}

describe('工作区默认 Skill 受管迁移', () => {
  it('同版本 legacy symlink 也必须替换为实体副本', () => {
    const root = tempRoot()
    const source = join(root, 'source')
    const target = join(root, 'target')
    mkdirSync(source)
    writeFileSync(join(source, 'SKILL.md'), '---\nversion: 1.2.3\n---\n')
    symlinkSync(source, target, 'dir')

    expect(managedSkillPathExists(target)).toBe(true)
    expect(shouldReplaceManagedSkill(target, '1.2.3')).toBe(true)
  })

  it('断开的 symlink 仍算已占用路径，并走安全替换', () => {
    const root = tempRoot()
    const target = join(root, 'target')
    symlinkSync(join(root, 'missing'), target, 'dir')

    expect(managedSkillPathExists(target)).toBe(true)
    expect(shouldReplaceManagedSkill(target, '1.0.0')).toBe(true)
  })

  it('实体目录仅在受管版本更高时替换', () => {
    const root = tempRoot()
    const target = join(root, 'target')
    mkdirSync(target)
    writeFileSync(join(target, 'SKILL.md'), '---\nversion: 1.2.3\n---\n')

    expect(shouldReplaceManagedSkill(target, '1.2.3')).toBe(false)
    expect(shouldReplaceManagedSkill(target, '1.2.4')).toBe(true)
  })

  it.each(['skills', 'skills-inactive'])('active/inactive legacy symlink 都迁移为实体副本: %s', (stateDir) => {
    const root = tempRoot()
    const source = join(root, 'managed-source')
    const liveSource = join(root, 'legacy-source')
    const target = join(root, stateDir, 'research-loop')
    mkdirSync(source)
    mkdirSync(liveSource)
    mkdirSync(join(root, stateDir))
    writeFileSync(join(source, 'SKILL.md'), 'managed copy')
    writeFileSync(join(liveSource, 'SKILL.md'), 'legacy link')
    symlinkSync(liveSource, target, 'dir')

    expect(safeReplaceSkillDir(source, target)).toBe(true)
    expect(lstatSync(target).isSymbolicLink()).toBe(false)
    expect(readFileSync(join(target, 'SKILL.md'), 'utf-8')).toBe('managed copy')
  })
})
