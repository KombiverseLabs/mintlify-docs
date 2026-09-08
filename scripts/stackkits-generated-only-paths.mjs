/**
 * Generated-only path classification for the StackKits release-docs sync.
 *
 * Git porcelain can report scratch downloads and a collapsed `data/` directory
 * alongside the files the workflow is allowed to commit. Those summaries are
 * not unexpected product paths; anything else stays fail-closed.
 */

export const STACKKITS_GENERATED_PATH_PATTERN =
  /^(?:\.tmp(?:\/.*)?|data\/?|data\/stackkits\/.*|guides\/stackkits\/use-cases\/overview\.mdx|stackkits\/reference\/(?:os|application-delivery)-compatibility\.mdx)$/

export function porcelainPath(line) {
  if (!line || line.length < 4) return ""
  let rest = line.slice(3)
  if (rest.startsWith('"') && rest.endsWith('"')) {
    rest = JSON.parse(rest)
  }
  const rename = rest.lastIndexOf(" -> ")
  if (rename >= 0) {
    rest = rest.slice(rename + 4)
    if (rest.startsWith('"') && rest.endsWith('"')) {
      rest = JSON.parse(rest)
    }
  }
  return rest
}

export function unexpectedStackkitsReleasePaths(porcelain) {
  const unexpected = []
  for (const line of String(porcelain).split(/\r?\n/)) {
    if (!line.trim()) continue
    const path = porcelainPath(line)
    if (!path) continue
    if (STACKKITS_GENERATED_PATH_PATTERN.test(path)) continue
    unexpected.push(path)
  }
  return unexpected
}

import { execFileSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const porcelain = execFileSync(
    "git",
    ["status", "--porcelain", "--untracked-files=all"],
    { encoding: "utf8" },
  )
  const unexpected = unexpectedStackkitsReleasePaths(porcelain)
  if (unexpected.length > 0) {
    console.error(`unexpected generated paths:\n${unexpected.join("\n")}`)
    process.exit(1)
  }
}
