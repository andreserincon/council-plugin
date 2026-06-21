export const meta = {
  name: 'forge-analyze',
  description: 'Read-only pre-build consistency gate: cross-checks the requirements, the spec/PRD, the build slice plan, and the constitution for coverage gaps, contradictions, ambiguity, duplication, and principle violations BEFORE forge spends build tokens. Borrowed from spec-kit analyze, adapted to the Council. Fails cheap so a misaligned spec is caught before an expensive build.',
  whenToUse: 'Run once in forge Step 2 / Phase 0, after the slice plan is drafted and before any code. Returns a pass/warn/fail gate with severity-rated findings and a requirement-to-slice coverage table. Never edits anything.',
  phases: [
    { title: 'Coverage' },
    { title: 'Checks' },
    { title: 'Gate' },
  ],
}

// ---- Inputs (pass via the Workflow tool's args) -------------------------------
// Harness gotcha, verified 2026-06-12: args can arrive as a JSON-encoded STRING.
// Parse defensively, fail loudly.
let input = args
for (let i = 0; i < 2 && typeof input === 'string'; i++) {
  try { input = JSON.parse(input) } catch (e) { break }
}
if (typeof input === 'string') { try { input = JSON.parse(input) } catch (e) { input = {} } }
if (input === null || typeof input !== 'object' || Array.isArray(input)) input = {}

const asArray = (v) => {
  if (Array.isArray(v)) return v
  if (typeof v === 'string') { try { const p = JSON.parse(v); return Array.isArray(p) ? p : [] } catch (e) { return [] } }
  return []
}

const requirements = asArray(input.requirements)
const slices = asArray(input.slices)
if (!requirements.length || !slices.length) {
  throw new Error(
    'forge-analyze: needs both a non-empty `requirements` array (each {id, priority, statement}) and a non-empty `slices` ' +
    'array (each {id, name, requirementIds, risk}). Pass args as a JSON object, for example ' +
    '{"requirements": [{"id":"R-01","priority":"P0","statement":"..."}], "slices": [{"id":"S-1","name":"...","requirementIds":["R-01"],"risk":"high"}], "specText": "...PRD...", "constitution": "...", "maxConcurrency": 4}.'
  )
}

const specText = (typeof input.specText === 'string' && input.specText.trim()) ? input.specText.trim() : ''
const constitution = (typeof input.constitution === 'string' && input.constitution.trim()) ? input.constitution.trim() : ''
const repoPath = (typeof input.repoPath === 'string' && input.repoPath.trim()) ? input.repoPath.trim() : ''
const maxConcurrency = Math.max(1, Math.min(16, input.maxConcurrency || 4))

const mapLimit = async (items, limit, fn) => {
  const out = []
  const n = Math.max(1, limit)
  for (let i = 0; i < items.length; i += n) {
    const wave = items.slice(i, i + n)
    const res = await parallel(wave.map((it, j) => () => fn(it, i + j)))
    out.push(...res)
  }
  return out
}
const norm = (s) => String(s || '').toLowerCase().trim()

// ---- Phase 1: Coverage (plain code; deterministic, zero agents) ----------------
phase('Coverage')
const reqIds = requirements.map((r) => String(r.id || '')).filter(Boolean)
const sliceReqRefs = (s) => asArray(s.requirementIds).concat(asArray(s.criteriaIds)).map((x) => String(x))
const isHigh = (r) => r.priority === 'P0' || r.priority === 'P1'

const coveredReqIds = new Set()
slices.forEach((s) => sliceReqRefs(s).forEach((id) => coveredReqIds.add(id)))

const uncovered = requirements.filter((r) => r.id && !coveredReqIds.has(String(r.id)))
const uncoveredP0P1 = uncovered.filter(isHigh)
const orphanSlices = slices.filter((s) => sliceReqRefs(s).filter((id) => reqIds.includes(id)).length === 0)
const danglingRefs = []
slices.forEach((s) => sliceReqRefs(s).forEach((id) => { if (id && !reqIds.includes(id)) danglingRefs.push({ slice: s.id || s.name, ref: id }) }))

const coverageTable = requirements.map((r) => ({
  requirement: r.id,
  priority: r.priority,
  slices: slices.filter((s) => sliceReqRefs(s).includes(String(r.id))).map((s) => s.id || s.name),
}))
const coveragePct = reqIds.length ? Math.round((reqIds.filter((id) => coveredReqIds.has(id)).length / reqIds.length) * 100) : 0
log(`Coverage: ${coveragePct}% of requirements have a slice; ${uncoveredP0P1.length} P0/P1 uncovered, ${orphanSlices.length} orphan slices, ${danglingRefs.length} dangling refs.`)

// ---- Phase 2: Semantic checks (parallel, bounded, adversarial) -----------------
phase('Checks')
const FINDING_NOTE =
  'Each finding: a category, a severity (CRITICAL blocks the build, HIGH blocks, MEDIUM is a warning, LOW is polish), ' +
  'a location (which artifact and where), a one-line summary, and a concrete recommendation. Be specific; cite the requirement or slice id.'

const ctx =
  `Requirements (what the build must satisfy): ${JSON.stringify(requirements)}\n` +
  `Build slice plan (how forge intends to build it): ${JSON.stringify(slices)}\n` +
  (specText ? `Spec / PRD: ${specText}\n` : 'No separate PRD text supplied; judge requirements against the slice plan.\n') +
  (constitution ? `CONSTITUTION (binding project principles; MUST violations are CRITICAL/HIGH): ${constitution}\n` : '') +
  (repoPath ? `Repo for grounding (read-only): ${repoPath}\n` : '') +
  `Plain-code coverage already computed: uncovered P0/P1 = ${JSON.stringify(uncoveredP0P1.map((r) => r.id))}, ` +
  `orphan slices = ${JSON.stringify(orphanSlices.map((s) => s.id || s.name))}, dangling refs = ${JSON.stringify(danglingRefs)}.\n`

const CHECK_SCHEMA = {
  type: 'object',
  required: ['check', 'findings', 'notes'],
  properties: {
    check: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['category', 'severity', 'location', 'summary', 'recommendation'],
        properties: {
          category: { type: 'string' },
          severity: { type: 'string', enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] },
          location: { type: 'string' },
          summary: { type: 'string' },
          recommendation: { type: 'string' },
        },
      },
    },
    notes: { type: 'string' },
  },
}

const CHECKS = [
  { key: 'consistency', active: true,
    charge: 'Find contradictions ACROSS the artifacts: a requirement the slice plan implements differently than stated, terminology or data entities named one way in requirements and another in slices or PRD, conflicting tech or ordering choices, or a PRD claim no requirement backs. Cross-artifact disagreement is the target.' },
  { key: 'clarity-testability', active: true,
    charge: 'Find requirements or acceptance criteria that are too vague to build or verify: vague modifiers (fast, scalable, intuitive) with no measurable target, verbs missing an object or outcome, untestable success criteria, or unresolved placeholders (TODO, ???, brackets). The question is whether each requirement is well-written enough to build and test against.' },
  { key: 'duplication', active: true,
    charge: 'Find near-duplicate requirements or slices that should be consolidated, and requirements that restate each other in different words. Flag the lower-quality phrasing as the consolidation candidate.' },
  { key: 'risk-ordering', active: true,
    charge: 'Judge whether the slice plan is genuinely risk-first: the slices that prove uncertain or scary infrastructure (new integrations, security boundaries, unproven architecture) should come BEFORE comfortable UI or CRUD work. Flag any plan that builds polish on top of unproven foundations, or that defers a make-or-break technical unknown.' },
  { key: 'constitution-alignment', active: !!constitution,
    charge: 'Check the requirements, the PRD, and the slice plan against the CONSTITUTION. Any requirement, choice, or slice that violates a MUST principle is CRITICAL or HIGH. A missing mandated section or quality gate the constitution requires is a finding. Quote the principle violated.' },
]
const activeChecks = CHECKS.filter((c) => c.active)

const checkResults = await mapLimit(activeChecks, maxConcurrency, (c) =>
  agent(
    `You are the "${c.key}" check on a forge-analyze pre-build consistency gate, reviewing adversarially. Assume the artifacts disagree until you confirm they align. Read-only: never edit anything, never start servers.\n` +
    `Your charge: ${c.charge}\n\n${ctx}\n${FINDING_NOTE}\nEcho check="${c.key}". Return an empty findings array if genuinely clean.`,
    { schema: CHECK_SCHEMA, label: `analyze:${c.key}`, phase: 'Checks' }
  )
)

// ---- Phase 3: Gate (plain code; fails closed) ----------------------------------
phase('Gate')
const checks = []
const missing = []
activeChecks.forEach((c, i) => {
  if (checkResults[i]) checks.push({ ...checkResults[i], check: c.key })
  else missing.push(c.key)
})

const semanticFindings = checks.flatMap((c) => (c.findings || []).map((f) => ({ ...f, check: c.check })))

// Turn the deterministic coverage results into findings too.
const coverageFindings = []
uncoveredP0P1.forEach((r) => coverageFindings.push({ check: 'coverage', category: 'coverage-gap', severity: 'HIGH', location: `requirement ${r.id} (${r.priority})`, summary: `${r.priority} requirement ${r.id} is implemented by no slice.`, recommendation: 'Add a slice that delivers it, or explicitly defer it with a reason.' }))
uncovered.filter((r) => !isHigh(r)).forEach((r) => coverageFindings.push({ check: 'coverage', category: 'coverage-gap', severity: 'MEDIUM', location: `requirement ${r.id} (${r.priority})`, summary: `${r.priority} requirement ${r.id} has no slice.`, recommendation: 'Add a slice or defer it.' }))
orphanSlices.forEach((s) => coverageFindings.push({ check: 'coverage', category: 'orphan-slice', severity: 'MEDIUM', location: `slice ${s.id || s.name}`, summary: 'Slice cites no requirement; it may be scope creep or a missing requirement.', recommendation: 'Tie it to a requirement or cut it.' }))
danglingRefs.forEach((d) => coverageFindings.push({ check: 'coverage', category: 'dangling-ref', severity: 'HIGH', location: `slice ${d.slice}`, summary: `Slice cites requirement ${d.ref}, which does not exist.`, recommendation: 'Fix the id or add the requirement.' }))

const allFindings = coverageFindings.concat(semanticFindings)
const sev = (lvl) => allFindings.filter((f) => f.severity === lvl)
const blockers = sev('CRITICAL').concat(sev('HIGH'))

let gate = 'pass'
if (blockers.length || missing.length) gate = 'fail'
else if (sev('MEDIUM').length || sev('LOW').length) gate = 'warn'

if (missing.length) log(`Gate fails closed: checks that did not run: ${missing.join(', ')}`)
log(`forge-analyze gate: ${gate} (${blockers.length} blockers, ${sev('MEDIUM').length} medium, ${sev('LOW').length} low).`)

const SUMMARY_SCHEMA = { type: 'object', required: ['summary'], properties: { summary: { type: 'string', description: 'Tight plain-English gate summary. No em dashes.' } } }
const summaryRaw = await agent(
  `Write a tight plain-English summary of this pre-build consistency gate for the user. Lead with the verdict and why, then the blockers (CRITICAL and HIGH) one per line, then notable warnings, then the coverage percentage. Do not soften failures. No em dashes.\n` +
  `Gate: ${gate}\nCoverage: ${coveragePct}%\nFindings: ${JSON.stringify(allFindings)}\nChecks that did not run (fail closed): ${JSON.stringify(missing)}`,
  { schema: SUMMARY_SCHEMA, phase: 'Gate' }
)

return {
  gate,
  blockers,
  findings: allFindings,
  checksNotRun: missing,
  coverage: { pct: coveragePct, table: coverageTable, uncoveredP0P1: uncoveredP0P1.map((r) => r.id), uncovered: uncovered.map((r) => r.id), orphanSlices: orphanSlices.map((s) => s.id || s.name), danglingRefs },
  summary: (summaryRaw && summaryRaw.summary) || `Gate: ${gate}. ${blockers.length} blockers. Summary agent failed; read findings.`,
}
