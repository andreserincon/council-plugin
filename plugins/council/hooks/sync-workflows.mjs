// SessionStart seed hook for the Council plugin.
//
// The Council skills invoke their workflows BY NAME via the Workflow tool, which
// resolves names from the user's ~/.claude/workflows folder. A plugin has no
// auto-discovery slot for saved workflows, so on a machine where the plugin is
// installed but the workflows are not yet present, this hook seeds them.
//
// COPY-IF-MISSING ONLY. It never overwrites an existing file, so on a machine
// where ~/.claude/workflows is the canonical, hand-edited source (the author's
// own setup), this hook is a harmless no-op and cannot revert local edits.
//
// Non-fatal by design: if ~/.claude is not writable (headless or read-only
// environments), it logs and exits 0 so it never blocks session start. In that
// case a skill can still run a workflow by scriptPath at
// ${CLAUDE_PLUGIN_ROOT}/workflows/<name>.js.

import { cpSync, mkdirSync, readdirSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = process.env.CLAUDE_PLUGIN_ROOT || dirname(dirname(fileURLToPath(import.meta.url)))
const home = homedir()

const seedDir = (srcDir, dstDir, filter) => {
  if (!existsSync(srcDir)) return
  mkdirSync(dstDir, { recursive: true })
  for (const f of readdirSync(srcDir)) {
    if (filter && !filter(f)) continue
    const dst = join(dstDir, f)
    if (!existsSync(dst)) cpSync(join(srcDir, f), dst) // never overwrite
  }
}

try {
  seedDir(join(root, 'workflows'), join(home, '.claude', 'workflows'), (f) => f.endsWith('.js'))
  seedDir(join(root, 'templates'), join(home, '.claude', 'templates'), null)
} catch (e) {
  console.error('council: workflow seed skipped (non-fatal):', e && e.message)
}
