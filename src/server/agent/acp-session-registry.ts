import { AcpSession, type AcpAgentSpec } from "./acp-session"

interface RegistryEntry {
  session: AcpSession
  lastUsedAt: number
  mutex: Promise<void>
  agentId: string
}

const IDLE_MS = 15 * 60_000
const REAP_INTERVAL_MS = 60_000

const sessions = new Map<string, RegistryEntry>()

let reaperHandle: NodeJS.Timeout | null = null

function startReaper(): void {
  if (reaperHandle) return
  reaperHandle = setInterval(() => {
    const now = Date.now()
    for (const [chatId, entry] of sessions.entries()) {
      if (now - entry.lastUsedAt > IDLE_MS) {
        void closeEntry(chatId, entry).catch(() => {
          /* swallow */
        })
      }
    }
  }, REAP_INTERVAL_MS)
}

async function closeEntry(chatId: string, entry: RegistryEntry): Promise<void> {
  sessions.delete(chatId)
  try {
    await entry.session.close()
  } catch {
    /* swallow */
  }
}

export async function getOrCreate(
  chatId: string,
  agentId: string,
  spec: AcpAgentSpec,
): Promise<AcpSession> {
  startReaper()
  const existing = sessions.get(chatId)
  if (existing) {
    if (existing.agentId === agentId && !existing.session.isDead) {
      existing.lastUsedAt = Date.now()
      return existing.session
    }
    await closeEntry(chatId, existing)
  }
  const session = new AcpSession()
  await session.init(spec)
  const entry: RegistryEntry = {
    session,
    lastUsedAt: Date.now(),
    mutex: Promise.resolve(),
    agentId,
  }
  sessions.set(chatId, entry)
  return session
}

export function has(chatId: string): boolean {
  return sessions.has(chatId)
}

export async function runExclusive<T>(
  chatId: string,
  fn: (session: AcpSession) => Promise<T>,
): Promise<T> {
  const entry = sessions.get(chatId)
  if (!entry) {
    throw new Error(`no acp session for chatId ${chatId}`)
  }
  const prev = entry.mutex
  let release!: () => void
  entry.mutex = new Promise<void>((resolve) => {
    release = resolve
  })
  await prev
  try {
    return await fn(entry.session)
  } finally {
    entry.lastUsedAt = Date.now()
    release()
  }
}

export async function close(chatId: string): Promise<void> {
  const entry = sessions.get(chatId)
  if (!entry) return
  await closeEntry(chatId, entry)
}

export async function closeAll(): Promise<void> {
  if (reaperHandle) {
    clearInterval(reaperHandle)
    reaperHandle = null
  }
  const all = Array.from(sessions.entries())
  sessions.clear()
  await Promise.all(
    all.map(async ([, entry]) => {
      try {
        await entry.session.close()
      } catch {
        /* swallow */
      }
    }),
  )
}
