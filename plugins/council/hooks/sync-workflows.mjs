// SessionStart sync hook for the Council plugin.
//
// The Council skills invoke their workflows BY NAME via the Workflow tool, which
// resolves names from ~/.claude/workflows. A plugin has no auto-discovery slot for
// saved workflows, so this hook keeps them in sync from the plugin.
//
// VERSION-AWARE SYNC. It copies the plugin's workflows (and the constitution
// template) into ~/.claude only when the plugin version changed since the last
// sync, tracked by a marker file. So:
//   - fresh install: seeds everything;
//   - plugin update to a new version: OVERWRITES with the new files, so workflow
//     changes actually reach existing installs (a plain copy-if-missing hook would
//     silently leave the old workflows in place);
//   - same version on later sessions: no-op, so it never clobbers every session and
//     never fights a same-version local edit.
//
// Non-fatal by design: if ~/.claude is not writable (headless or read-only), it
// logs and exits 0 so it never blocks session start.

import { cpSync, mkdirSync, readdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = process.env.CLAUDE_PLUGIN_ROOT || dirname(dirname(fileURLToPath(import.meta.url)))
const home = homedir()
const wfDst = join(home, '.claude', 'workflows')
const marker = join(wfDst, '.council-plugin-version')

const readVersion = () => {
  try { return JSON.parse(readFileSync(join(root, '.claude-plugin', 'plugin.json'), 'utf8')).version || '0' }
  catch (e) { return '0' }
}
const readMarker = () => {
  try { return existsSync(marker) ? readFileSync(marker, 'utf8').trim() : null }
  catch (e) { return null }
}
const copyDir = (srcDir, dstDir, filter) => {
  if (!existsSync(srcDir)) return
  mkdirSync(dstDir, { recursive: true })
  for (const f of readdirSync(srcDir)) {
    if (filter && !filter(f)) continue
    cpSync(join(srcDir, f), join(dstDir, f)) // overwrite
  }
}

try {
  const pluginVersion = readVersion()
  if (readMarker() !== pluginVersion) {
    copyDir(join(root, 'workflows'), wfDst, (f) => f.endsWith('.js'))
    copyDir(join(root, 'templates'), join(home, '.claude', 'templates'), null)
    mkdirSync(wfDst, { recursive: true })
    writeFileSync(marker, pluginVersion)
  }
} catch (e) {
  console.error('council: workflow sync skipped (non-fatal):', e && e.message)
}
