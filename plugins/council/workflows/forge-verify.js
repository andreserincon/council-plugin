export const meta = {
  name: 'forge-verify',
  description: 'Read-only adversarial verification gate for a forge build slice: spec conformance, correctness, security, data integrity, design fidelity, regression, and build/test health. The mirror of facelift-verify for NEW behavior instead of preserved behavior.',
  whenToUse: 'Run after each forge risk spike, after every build slice, and once with finalPass=true at the end of the build. Returns a pass/warn/fail gate with blockers, warnings, and per-acceptance-criterion status. Never edits anything.',
  phases: [
    { title: 'Checks' },
    { title: 'Criteria' },
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
    `forge-verify: missing required arg "${name}". Pass args as a JSON object, for example ` +
    '{"repoPath": "C:\\\\path\\\\to\\\\repo", "baseRef": "main", "spec": {"sliceName": "...", "acceptanceCriteria": [{"id": "AC-1", "text": "..."}]}, ' +
    '"mode": "greenfield", "securitySensitive": true, "testResults": "...build and test output...", "screenshotsAfter": ["..."], "direction": {"name": "...", "previewPath": "..."}, "mandate": "...", "finalPass": false}.'
  )
}

const repoPath = (typeof input.repoPath === 'string' && input.repoPath.trim()) ? input.repoPath.trim() : required('repoPath')
const baseRef = (typeof input.baseRef === 'string' && input.baseRef.trim()) ? input.baseRef.trim() : required('baseRef')

let spec = input.spec || null
if (typeof spec === 'string') { try { spec = JSON.parse(spec) } catch (e) { spec = { sliceName: 'unnamed', acceptanceCriteria: [{ id: 'AC-?', text: spec }] } } }
if (!spec || typeof spec !== 'object' || Array.isArray(spec) || !Array.isArray(spec.acceptanceCriteria)) required('spec')

const mode = (input.mode === 'behavior-change') ? 'behavior-change' : 'greenfield'
const securitySensitive = !!input.securitySensitive
const finalPass = !!input.finalPass
const sliceName = (typeof input.sliceName === 'string' && input.sliceName.trim()) ? input.sliceName.trim() : (spec.sliceName || 'unnamed slice')
const testResults = (typeof input.testResults === 'string' && input.testResults.trim()) ? input.testResults.trim() : ''
const after = Array.isArray(input.screenshotsAfter) ? input.screenshotsAfter.filter((p) => typeof p === 'string' && p.trim()) : []

let direction = input.direction || null
if (typeof direction === 'string') { try { direction = JSON.parse(direction) } catch (e) { direction = { name: 'unnamed', intent: direction } } }
const hasDirection = !!(direction && typeof direction === 'object' && !Array.isArray(direction))

const mandate = (typeof input.mandate === 'string' && input.mandate.trim()) ? input.mandate.trim() : null
const mandateBlock = mandate
  ? `\nBINDING MANDATE from the user. Violations are blockers, not opinions:\n${mandate}\n`
  : ''

// The constitution: durable project principles. MUST violations are blockers.
const constitution = (typeof input.constitution === 'string' && input.constitution.trim()) ? input.constitution.trim() : ''
const constitutionBlock = constitution
  ? `\nPROJECT CONSTITUTION (binding principles; a MUST violation is a blocker, a SHOULD violation a warning):\n${constitution}\n`
  : ''

log(`Verifying ${finalPass ? 'FINAL whole-build pass' : `slice "${sliceName}"`} (${mode}) against ${baseRef}`)
if (!testResults) log('No test/build results provided; the build-and-tests check runs on the diff alone and the gate notes the limitation.')
if (!after.length && hasDirection) log('A UI direction was given but no after-screenshots; design fidelity runs code-only.')

// ---- Shared context ------------------------------------------------------------
const ctx =
  `Repo: ${repoPath}\n` +
  `Diff base: ${baseRef}. Review the actual changes with READ-ONLY git, for example: git -C "${repoPath}" diff ${baseRef} (plus git log / git show as needed).\n` +
  `Build mode: ${mode} (greenfield = net-new; behavior-change = new behavior on an existing app).\n` +
  `Scope: ${finalPass ? 'FINAL whole-build pass; judge the entire result' : `build slice "${sliceName}"`}.\n` +
  `THE SPEC, the binding oracle (this build is judged against it, not against any prior behavior): ${JSON.stringify(spec)}\n` +
  `Build and test output provided by the builder: ${testResults ? testResults : 'NONE PROVIDED'}\n` +
  `After screenshots of any UI built (open and read each): ${JSON.stringify(after)}\n` +
  (hasDirection ? `Chosen UI direction: ${JSON.stringify(direction)}\n` : 'No UI direction supplied (this slice may be non-visual).\n') +
  mandateBlock +
  constitutionBlock +
  `\nHARD RULES: you are read-only. Never edit files, never run state-changing git (no add, commit, checkout, restore, stash), ` +
  `never start dev servers, preview tools, or browsers; work from the diff, the provided test output, and the screenshots. ` +
  `A verdict of fail requires at least one blocker, and every blocker must carry concrete evidence: a file path, a diff hunk, an acceptance-criterion id, a test line, or a screenshot detail.`

// ---- Schemas -----------------------------------------------------------------
const CHECK_SCHEMA = {
  type: 'object',
  required: ['check', 'verdict', 'blockers', 'warnings', 'notes'],
  properties: {
    check: { type: 'string', description: 'Echo the exact check key you were given.' },
    verdict: { type: 'string', enum: ['pass', 'warn', 'fail', 'na'] },
    blockers: { type: 'array', items: { type: 'string' }, description: 'Must-fix problems, each with concrete evidence. Required non-empty when verdict is fail.' },
    warnings: { type: 'array', items: { type: 'string' }, description: 'Should-fix problems that do not block the gate.' },
    notes: { type: 'string', description: 'Short summary of what was examined and the overall read.' },
  },
}

const CRITERIA_STATUS_SCHEMA = {
  type: 'object',
  required: ['criteria'],
  properties: {
    criteria: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'status', 'evidence'],
        properties: {
          id: { type: 'string' },
          status: { type: 'string', enum: ['met', 'partial', 'unmet'] },
          evidence: { type: 'string', description: 'The diff hunk, file, test line, or screenshot that shows the status.' },
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
    key: 'spec-conformance', rubric: null, always: true,
    charge:
      'For EACH acceptance criterion in the spec, decide whether the diff actually implements it. A criterion that is unmet, or only stubbed/mocked while claiming to work, is a blocker. Do not be satisfied by code that merely compiles; trace that the criterion is genuinely satisfied. Partial implementations are blockers when the criterion is in scope for this slice.',
  },
  {
    key: 'correctness', rubric: null, always: true,
    charge:
      'Hunt for logic that is wrong, not just absent: off-by-one and boundary errors, mishandled null/empty/error states, race conditions, incorrect conditionals, money and date math, unhandled promise rejections, and state that can desync. For a finance build, arithmetic and rounding errors are blockers. Read the actual changed code; do not sample.',
  },
  {
    key: 'security', rubric: null, always: true,
    charge:
      'Adversarially audit the diff for security defects: secrets in code or logs, unsafe handling of credentials and tokens, missing encryption at rest for sensitive data, injection (SQL, shell, path), unsafe IPC or message boundaries, over-broad permissions, unvalidated external input, and insecure defaults. ' +
      (securitySensitive ? 'This build is SECURITY-SENSITIVE (credentials/financial data): any real vulnerability is a blocker, and weak-but-not-broken handling is at least a warning.' : 'Real vulnerabilities are blockers; hardening opportunities are warnings.'),
  },
  {
    key: 'data-integrity', rubric: null, always: true,
    charge:
      'Check the data layer the slice touches: schema and migration correctness and reversibility, persistence actually wired (not just local state), query and cache keys, idempotency of writes, and that no path can silently lose or corrupt user data. For a finance build, every stored money value must reconcile to its source and survive a reload. Data-loss or corruption paths are blockers.',
  },
  {
    key: 'build-and-tests', rubric: null, always: true,
    charge:
      'Judge whether this slice actually builds, typechecks, and passes its tests, using the provided build/test output as primary evidence and the diff as support. A failing build or failing test is a blocker. Missing tests for new behavior the spec calls out is a warning (a blocker on the final pass). If no build/test output was provided, you cannot confirm health: say so and return warn, never pass.',
  },
  {
    key: 'regression', rubric: null, always: !finalPass ? true : true,
    charge:
      'Check that this slice did not break previously-built behavior: shared components, types, and contracts changed under it; routes or wiring it touched; and anything earlier slices depended on. For greenfield, "previously built" means earlier slices in this same build. Newly broken prior behavior is a blocker.',
  },
  {
    key: 'design-fidelity', rubric: RUBRICS.taste, always: hasDirection,
    charge:
      `Judge how faithfully any UI the slice builds expresses the chosen direction (its intent and moves) and meets the craft bar: real design system, visual hierarchy, the eight interactive states, accessibility (contrast, focus, keyboard), and responsiveness. Drift to generic or templated styling, or any style the mandate bans, is a blocker. If this slice built no UI, return na.`,
  },
  {
    key: 'constitution-alignment', rubric: null, always: !!constitution,
    charge:
      'Check the diff against the PROJECT CONSTITUTION in your context. For each MUST principle, confirm the change honors it; a violation of a MUST is a blocker, quoting the principle. A SHOULD violation is a warning. If a constitution-mandated practice (a security rule, a data rule, a house rule) is absent where the slice should apply it, that is a finding too.',
  },
]

const activeChecks = CHECKS.filter((c) => c.always)
const checkResults = await parallel(activeChecks.map((c) => () =>
  agent(
    `You are the "${c.key}" check on a forge build verification gate, reviewing adversarially and independently. Assume the builder got it wrong until the evidence says otherwise.\n` +
    (c.rubric ? `FIRST load your rubric: invoke the \`${c.rubric}\` skill via the Skill tool if your environment exposes it, and apply its method. If it is not available, proceed with the charge alone.\n` : '') +
    `Your charge: ${c.charge}\n\n${ctx}\n\nEcho check="${c.key}" in your result. Use verdict "na" only if this check genuinely does not apply to this slice.`,
    { schema: CHECK_SCHEMA, label: `check:${c.key}`, phase: 'Checks' }
  )
))

// ---- Phase 2: Per-acceptance-criterion status ----------------------------------
phase('Criteria')
let criteriaStatus = { criteria: [] }
if (Array.isArray(spec.acceptanceCriteria) && spec.acceptanceCriteria.length) {
  const cs = await agent(
    `Map each acceptance criterion in the spec to its real status in the diff. For every criterion decide: met (fully ` +
    `implemented and working), partial (started but incomplete; say what is missing), or unmet. Evidence is mandatory: ` +
    `cite the diff hunk, file, test line, or screenshot.\n` +
    `Acceptance criteria: ${JSON.stringify(spec.acceptanceCriteria)}\n\n${ctx}`,
    { schema: CRITERIA_STATUS_SCHEMA, phase: 'Criteria' }
  )
  criteriaStatus = cs || { criteria: spec.acceptanceCriteria.map((a) => ({ id: String(a.id || '?'), status: 'unmet', evidence: 'criteria-status agent failed; status unknown' })) }
} else {
  log('Spec carried no acceptance criteria; skipping criterion mapping (and that itself is a warning).')
}

// ---- Phase 3: Gate (plain code; a crashed or skipped check fails closed) --------
phase('Gate')
const checks = []
const missing = []
activeChecks.forEach((c, i) => {
  if (checkResults[i]) checks.push({ ...checkResults[i], check: c.key })
  else missing.push(c.key)
})
const allBlockers = checks.flatMap((c) => (c.blockers || []).map((b) => `[${c.check}] ${b}`))
const allWarnings = checks.flatMap((c) => (c.warnings || []).map((w) => `[${c.check}] ${w}`))
const failed = checks.filter((c) => c.verdict === 'fail').map((c) => c.check)
const unmetCriteria = (criteriaStatus.criteria || []).filter((c) => c.status === 'unmet')

// Security must actually run on a security-sensitive build.
const securityCheck = checks.find((c) => c.check === 'security')
const securityNotRun = securitySensitive && (!securityCheck || securityCheck.verdict === 'na')

let gate = 'pass'
if (failed.length || allBlockers.length || missing.length || securityNotRun || (finalPass && unmetCriteria.length)) gate = 'fail'
else if (allWarnings.length || checks.some((c) => c.verdict === 'warn') || !testResults || unmetCriteria.length) gate = 'warn'

if (missing.length) log(`Gate fails closed: checks that did not run: ${missing.join(', ')}`)
if (securityNotRun) log('Gate fails closed: security-sensitive build but the security check did not run.')
log(`Gate: ${gate} (${allBlockers.length} blockers, ${allWarnings.length} warnings, ${unmetCriteria.length} unmet criteria)`)

const summaryRaw = await agent(
  `Write a tight plain-English summary of this forge build verification gate for the user. Lead with the gate verdict and why. ` +
  `Then the blockers (each in one line), then notable warnings, then the acceptance criteria still unmet or partial. ` +
  `No em dashes. Do not soften failures.\n` +
  `Gate: ${gate}\nChecks: ${JSON.stringify(checks)}\nChecks that did not run (gate fails closed): ${JSON.stringify(missing)}\n` +
  `Security not run on a sensitive build: ${securityNotRun}\n` +
  `Criteria status: ${JSON.stringify(criteriaStatus)}\nBuild/test output was ${testResults ? 'provided' : 'NOT provided'}.`,
  { schema: SUMMARY_SCHEMA, phase: 'Gate' }
)

return {
  gate,
  blockers: allBlockers,
  warnings: allWarnings,
  checks,
  checksNotRun: missing,
  securityNotRun,
  criteriaStatus,
  testEvidence: testResults ? 'provided' : 'missing',
  visualMode: after.length ? 'live' : (hasDirection ? 'code-only' : 'no-ui'),
  summary: (summaryRaw && summaryRaw.summary) || `Gate: ${gate}. ${allBlockers.length} blockers, ${allWarnings.length} warnings. Summary agent failed; read the checks array.`,
}
