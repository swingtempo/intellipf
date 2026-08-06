import { AsyncLocalStorage } from 'node:async_hooks'

// Set up TanStack Start's AsyncLocalStorage before any server modules load.
const GLOBAL_STORAGE_KEY = Symbol.for('tanstack-start:start-storage-context')
if (!(globalThis as Record<symbol, unknown>)[GLOBAL_STORAGE_KEY]) {
  ;(globalThis as Record<symbol, unknown>)[GLOBAL_STORAGE_KEY] = new (class extends AsyncLocalStorage<any> {
    getStore() { return { startOptions: {} } }
  })()
}
console.log('[vitest.setup] TanStack Start context initialized')
