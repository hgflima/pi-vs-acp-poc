import { AsyncLocalStorage } from "node:async_hooks"
import type { RuntimeEvent } from "./runtime"

export interface PiRuntimeContext {
  push: (ev: RuntimeEvent) => void
}

export const piRuntimeStore = new AsyncLocalStorage<PiRuntimeContext>()
