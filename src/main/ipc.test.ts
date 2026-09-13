import { describe, expect, it } from 'vitest'
import { registerIpc } from './ipc'
import { IPC } from '../shared/ipc'

describe('registerIpc', () => {
  it('answers app info over IPC', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    registerIpc({ handle: (ch, fn) => handlers.set(ch, fn) }, { version: '0.1.0', dbPath: '/db', dmmOsRoot: '/root' })
    expect(await handlers.get(IPC.getAppInfo)!({})).toEqual({ version: '0.1.0', dbPath: '/db', dmmOsRoot: '/root' })
  })
})
