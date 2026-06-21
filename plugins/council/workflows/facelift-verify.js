export const meta = {
  name: 'facelift-verify',
  description: 'Read-only adversarial verification gate for a facelift rollout group: behavior preservation, direction fidelity, accessibility, motion restraint, copy, and anti-AI-tell.',
  whenToUse: 'Run after the facelift pilot screens, after every rollout group, and once with finalPass=true at the end of the facelift. Returns a pass/warn/fail gate with blockers, warnings, and punch-item status. Never edits anything.',
  phases: [
    { title: 'Checks' },
    { title: 'Punch' },
    { title: 'Gate' },
  ],
}

// ---- Inputs (pass via the Workflow tool's args) -------------------------------
// Harness gotcha, verified 2026-06-12: args can arrive as a JSON-encoded STRING
// even when the caller passed an object. Parse defensively, fail loudly.
let input = args
for (let i = 0; i < 2 && typeof input === 'string'; i++) {
  try { input = JSON.parse(input) } catch (e) { break }
}
if (input === null || typeof input !== 'object' || Array.isArray(input)) input = {}

const required = (name) => {
  throw new Error(
    `facelift-verify: missing required arg "${name}". Pass args as a JSON object, for example ` +
    '{"repoPath": "C:\\\\path\\\\to\\\\repo", "baseRef": "main", "direction": {"name": "...", "intent": "...", "moves": ["..."], "previewPath": "..."}, ' +
    '"groupName": "settings screens", "screens": ["..."], "screenshotsBefore": ["..."], "screenshotsAfter": ["..."], "punchItems": [{"id": "P1-3", "finding": "...", "fix": "..."}], "mandate": "...", "finalPass": false}.'
  )
}

const repoPath = (typeof input.repoPath === 'string' && input.repoPath.trim()) ? input.repoPath.trim() : required('repoPath')
const baseRef = (typeof input.baseRef === 'string' && input.baseRef.trim()) ? input.baseRef.trim() : required('baseRef')

let direction = input.direction || null
if (typeof direction === 'string') {
  try { direction = JSON.parse(direction) } catch (e) { direction = { name: 'unnamed direction', intent: direction, moves: [] } }
}
if (!direction || typeof direction !== 'object' || Array.isArray(direction)) required('direction')

const mandate = (typeof input.mandate === 'string' && input.mandate.trim()) ? input.mandate.trim() : null
const mandateBlock = mandate
  ? `\nBINDING DESIGN MANDATE from the user. Violations are blockers, not opinions:\n${mandate}\n`
  : ''

// The constitution: durable project principles. MUST violations are blockers.
const constitution = (typeof input.constitution === 'string' && input.constitution.trim()) ? input.constitution.trim() : ''
const constitutionBlock = constitution
  ? `\nPROJECT CONSTITUTION (binding principles; a MUST violation is a blocker, a SHOULD violation a warning):\n${constitution}\n`
  : ''

const groupName = (typeof input.groupName === 'string' && input.groupName.trim()) ? input.groupName.trim() : 'unnamed group'
const screens = Array.isArray(input.screens) ? input.screens.filter((s) => typeof s === 'string' && s.trim()) : []
const punchItems = Array.isArray(input.punchItems) ? input.punchItems : []
const before = Array.isArray(input.screenshotsBefore) ? input.screenshotsBefore.filter((p) => typeof p === 'string' && p.trim()) : []
const after = Array.isArray(input.screenshotsAfter) ? input.screenshotsAfter.filter((p) => typeof p === 'string' && p.trim()) : []
const finalPass = !!input.finalPass

log(`Verifying ${finalPass ? 'FINAL whole-app pass' : `group "${groupName}"`} against ${baseRef}`)
if (!after.length) log('No after-screenshots provided; visual checks run code-only and the gate will note the limitation.')

// ---- Shared context ------------------------------------------------------------
const ctx =
  `Repo: ${repoPath}\n` +
  `Diff base: ${baseRef}. Review the actual changes with READ-ONLY git, for example: git -C "${repoPath}" diff ${baseRef} (plus git log / git show as needed).\n` +
  `Scope: ${finalPass ? 'FINAL whole-app pass; judge the entire facelift result' : `rollout group "${groupName}"`}.\n` +
  `Screens in scope: ${JSON.stringify(screens)}\n` +
  `Before screenshots (pre-facelift state): ${JSON.stringify(before)}\n` +
  `After screenshots (current state; open and read each): ${JSON.stringify(after)}\n` +
  `Chosen direction: ${JSON.stringify(direction)}\n` +
  mandateBlock +
  constitutionBlock +
  `\nHARD RULES: you are read-only. Never edit files, never run state-changing git commands (no add, commit, checkout, restore, stash), ` +
  `never start dev servers, preview tools, or browsers; screenshots are provided. ` +
  `A verdict of fail requires at least one blocker, and every blocker must carry concrete evidence: a file path, a diff hunk, or a screenshot detail.`

// ---- Schemas -----------------------------------------------------------------
const CHECK_SCHEMA = {
  type: 'object',
  required: ['check', 'verdict', 'blockers', 'warnings', 'notes'],
  properties: {
    check: { type: 'string', description: 'Echo the exact check key you were given.' },
    verdict: { type: 'string', enum: ['pass', 'warn', 'fail'] },
    blockers: { type: 'array', items: { type: 'string' }, description: 'Must-fix problems, each with concrete evidence. Required non-empty when verdict is fail.' },
    warnings: { type: 'array', items: { type: 'string' }, description: 'Should-fix problems that do not block the gate.' },
    notes: { type: 'string', description: 'Short summary of what was examined and the overall read.' },
  },
}

const PUNCH_STATUS_SCHEMA = {
  type: 'object',
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'status', 'evidence'],
        properties: {
          id: { type: 'string' },
          status: { type: 'string', enum: ['addressed', 'partial', 'untouched'] },
          evidence: { type: 'string', description: 'The diff hunk, file, or screenshot that shows the status.' },
        },
      },
    },
  },
}

const SUMMARY_SCHEMA = {
  type: 'object',
  required: ['summary'],
  properties: {
    summary: { type: 'string', description: 'A tight plain-English summary of the gate result for the user. No em dashes.' },
  },
}

// ---- Phase 1: Checks (parallel, adversarial) -----------------------------------
phase('Checks')
// Skill names (portable), not machine-specific file paths. The check agent loads
// the rubric by invoking the skill if its environment exposes it; else the charge.
const RUBRICS = {
  taste: 'design-taste-frontend',
  system: 'impeccable',
  motion: 'emil-design-eng',
}

const CHECKS = [
  {
    key: 'behavior-logic',
    rubric: null,
    charge:
      'Hunt the diff for ANY behavior change. A facelift is presentation-only, so every behavior delta is a blocker: ' +
      'removed or altered event handlers, changed conditions or early returns, modified props or state shape, deleted elements that carried logic, ' +
      'changed routes or links, altered form validation, added or removed side effects. Read the full diff hunk by hunk; do not sample.',
  },
  {
    key: 'behavior-wiring',
    rubric: null,
    charge:
      'Trace the data wiring end to end across the diff: data fetching and mutations, query and cache keys, form submission targets, navigation destinations, ' +
      'i18n keys, element IDs and test hooks, and conditional rendering driven by data. Confirm every touched screen still renders the same data and triggers the same actions as before. ' +
      'Any broken or silently re-routed wiring is a blocker.',
  },
  {
    key: 'fidelity',
    rubric: RUBRICS.taste,
    charge:
      `Judge how faithfully the implementation expresses the chosen direction: its intent, each of its moves, and its preview file at ${direction.previewPath || 'not provided'} (open it when provided). ` +
      'Compare the after screenshots and the changed code against that direction. Drift back toward generic styling, the pre-facelift look, or a banned style is a blocker on the move it betrays. ' +
      'Partially applied moves are warnings with the missing part named.',
  },
  {
    key: 'accessibility',
    rubric: RUBRICS.system,
    charge:
      'Check the changed screens for accessibility regressions: contrast of new color pairings, visible focus states on every interactive element, keyboard reachability and order, ' +
      'hit-area sizes, semantic structure of headings and landmarks, and respect for prefers-reduced-motion on any new animation. Regressions from the before state are blockers; pre-existing issues are warnings.',
  },
  {
    key: 'motion',
    rubric: RUBRICS.motion,
    charge:
      'Review every animation and transition the diff adds or changes: is each one justified (feedback, orientation, continuity), are easing and durations deliberate rather than defaults, ' +
      'is restraint kept on high-frequency and keyboard-initiated actions, and does perceived performance improve rather than suffer. Gratuitous or janky motion is a warning; motion that blocks or delays user input is a blocker.',
  },
  {
    key: 'content',
    rubric: null,
    charge:
      'Review all UI copy the diff touches: button labels are verb plus object and say what happens; terms stay consistent across screens and use the domain words; ' +
      'error messages name the problem and the fix near the field; empty states say what the thing is and how to fill it; numbers, dates, and currency stay locale-consistent; ' +
      'bilingual apps stay consistent within each language. Em dashes anywhere in UI copy are a blocker. Meaning changes to existing copy are blockers; pure tone-of-voice drift is a warning.',
  },
  {
    key: 'anti-ai-tell',
    rubric: RUBRICS.taste,
    charge:
      'Judge whether the implemented screens read as AI-built or templated: interchangeable layouts, kit-first composition, decoration that ignores the content, or any style the mandate bans (a banned style is an automatic blocker). ' +
      'Name what specifically reads as templated and what would make it read as designed for this exact product.',
  },
]

// Constitution alignment is added only when a constitution was provided.
if (constitution) {
  CHECKS.push({
    key: 'constitution-alignment',
    rubric: null,
    charge:
      'Check the diff against the PROJECT CONSTITUTION in your context. A violation of a MUST principle is a blocker, quoting the principle; a SHOULD violation is a warning. Also flag where a constitution-mandated practice that applies to these screens is absent.',
  })
}

const checkResults = await parallel(CHECKS.map((c) => () =>
  agent(
    `You are the "${c.key}" check on a facelift verification gate, reviewing adversarially and independently. Assume the implementer got it wrong until the evidence says otherwise.\n` +
    (c.rubric ? `FIRST load your rubric: invoke the \`${c.rubric}\` skill via the Skill tool if your environment exposes it, and apply its method. If it is not available, proceed with the charge alone.\n` : '') +
    `Your charge: ${c.charge}\n\n${ctx}\n\nEcho check="${c.key}" in your result.`,
    { schema: CHECK_SCHEMA, label: `check:${c.key}`, phase: 'Checks' }
  )
))

// ---- Phase 2: Punch-item status (only when items were targeted) ----------------
phase('Punch')
let punchStatus = { items: [] }
if (punchItems.length) {
  const ps = await agent(
    `Map each targeted punch-list item to its real status in the diff. For every item decide: addressed (the fix is fully in), ` +
    `partial (started but incomplete; say what is missing), or untouched. Evidence is mandatory: cite the diff hunk, file, or screenshot.\n` +
    `Punch items targeted by this ${finalPass ? 'facelift' : 'group'}: ${JSON.stringify(punchItems)}\n\n${ctx}`,
    { schema: PUNCH_STATUS_SCHEMA, phase: 'Punch' }
  )
  punchStatus = ps || { items: punchItems.map((p) => ({ id: String(p.id || '?'), status: 'untouched', evidence: 'punch-status agent failed; statuses unknown' })) }
} else {
  log('No punch items passed for this group; skipping punch-status mapping.')
}

// ---- Phase 3: Gate (plain code; a crashed check fails closed) -------------------
phase('Gate')
const checks = []
const missing = []
CHECKS.forEach((c, i) => {
  if (checkResults[i]) checks.push({ ...checkResults[i], check: c.key })
  else missing.push(c.key)
})
const allBlockers = checks.flatMap((c) => (c.blockers || []).map((b) => `[${c.check}] ${b}`))
const allWarnings = checks.flatMap((c) => (c.warnings || []).map((w) => `[${c.check}] ${w}`))
const failed = checks.filter((c) => c.verdict === 'fail').map((c) => c.check)

let gate = 'pass'
if (failed.length || allBlockers.length || missing.length) gate = 'fail'
else if (allWarnings.length || checks.some((c) => c.verdict === 'warn') || !after.length) gate = 'warn'

if (missing.length) log(`Gate fails closed: checks that did not run: ${missing.join(', ')}`)
log(`Gate: ${gate} (${allBlockers.length} blockers, ${allWarnings.length} warnings)`)

const summaryRaw = await agent(
  `Write a tight plain-English summary of this facelift verification gate for the user. Lead with the gate verdict and why. ` +
  `Then the blockers (each in one line), then notable warnings, then the punch-item statuses worth mentioning. ` +
  `No em dashes. Do not soften failures.\n` +
  `Gate: ${gate}\nChecks: ${JSON.stringify(checks)}\nChecks that did not run (gate fails closed): ${JSON.stringify(missing)}\n` +
  `Punch status: ${JSON.stringify(punchStatus)}\nAfter-screenshots were ${after.length ? 'provided' : 'NOT provided (visual checks were code-only)'}.`,
  { schema: SUMMARY_SCHEMA, phase: 'Gate' }
)

return {
  gate,
  blockers: allBlockers,
  warnings: allWarnings,
  checks,
  checksNotRun: missing,
  punchStatus,
  visualMode: after.length ? 'live' : 'code-only',
  summary: (summaryRaw && summaryRaw.summary) || `Gate: ${gate}. ${allBlockers.length} blockers, ${allWarnings.length} warnings. Summary agent failed; read the checks array.`,
}
