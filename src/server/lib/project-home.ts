import { existsSync, statSync } from "node:fs"
import path from "node:path"

function resolveProjectHome(): string {
  const raw = process.env.CWD
  if (!raw) return process.cwd()

  if (!path.isAbsolute(raw)) {
    console.error(
      `FATAL: CWD must be an absolute path, got '${raw}'.`
    )
    process.exit(1)
  }

  if (!existsSync(raw)) {
    console.error(`FATAL: CWD does not exist: '${raw}'.`)
    process.exit(1)
  }

  if (!statSync(raw).isDirectory()) {
    console.error(`FATAL: CWD is not a directory: '${raw}'.`)
    process.exit(1)
  }

  return raw
}

export const PROJECT_HOME: string = resolveProjectHome()
