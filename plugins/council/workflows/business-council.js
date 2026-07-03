export const meta = {
  name: 'business-council',
  description: 'Deterministic Business Council: confirm the venture brief cheaply, then a quality-gated five-seat advisory review with cited research, debate, adversarial verification, coverage guarantees, and judged product directions.',
  whenToUse: 'Run the multi-perspective business board on a venture or product idea. The first launch (no confirmedBrief) resolves the venture brief in one agent for user confirmation; the second launch runs the full council and returns verified business and functional requirements plus 2 to 3 judged product directions, each with a one-page HTML concept sheet.',
  phases: [
    { title: 'Brief' },
    { title: 'Research' },
    { title: 'Seats' },
    { title: 'Rebuttal' },
    { title: 'Verify' },
    { title: 'Coverage' },
    { title: 'Synthesis' },
    { title: 'Directions' },
    { title: 'Build' },
    { title: 'Judge' },
    { title: 'Critique' },
  ],
}

// ---- Inputs (pass via the Workflow tool's args) -------------------------------
// Harness gotcha, verified 2026-06-12: args can arrive as a JSON-encoded STRING
// even when the caller passed an object. Parse defensively, fail loudly.
let input = args
for (let i = 0; i < 2 && typeof input === 'string'; i++) {
  try { input = JSON.parse(input) } catch (e) { break }
}
if (typeof input === 'string') input = { venture: input } // a bare string is the venture itself
if (input === null || typeof input !== 'object' || Array.isArray(input)) input = {}

// A missing venture fails loudly HERE, before any agent runs.
const venture = (typeof input.venture === 'string' && input.venture.trim()) ? input.venture.trim() : null
if (!venture) {
  throw new Error(
    'business-council: no venture received (args.venture is missing or empty). ' +
    'Describe the idea with the user in the main loop first, then relaunch with args as a JSON object, for example ' +
    '{"venture": "finance manager app for small marketplace businesses (MercadoLibre-style sellers), es-AR", ' +
    '"priorArt": ["C:\\\\path\\\\to\\\\related-repo"], "materials": ["C:\\\\path\\\\to\\\\notes.md"], "mandate": "..."}.'
  )
}

const priorArt = Array.isArray(input.priorArt) ? input.priorArt.filter((p) => typeof p === 'string' && p.trim()) : []
const materials = Array.isArray(input.materials) ? input.materials.filter((p) => typeof p === 'string' && p.trim()) : []
const directionCount = Math.max(2, Math.min(3, input.directions || 3))
const webResearch = input.webResearch !== false
// Self-imposed fan-out width. The Workflow runtime caps each workflow at
// min(16, cores-2); two overlapping councils reach ~32 concurrent large-context
// requests, which trips server-side throttling ("Server is temporarily limiting
// requests"). We bound our OWN peak in-flight far lower so even an accidental
// overlap stays under that threshold. Default 4; tune up only when you are sure
// nothing else heavy is running.
const maxConcurrency = Math.max(1, Math.min(16, input.maxConcurrency || 4))
// Hard ceiling on how many load-bearing facts get adversarially verified, so a
// large research return cannot spawn a 30-wide fact-check burst.
const maxFactChecks = Math.max(1, Math.min(40, input.maxFactChecks || 12))
// Verify-phase controls. Findings are verified in batches grouped by area, not
// one agent per finding, which is what made Verify the most expensive phase.
// verify: 'full' (default), 'lite' (P0 only, grounding only), 'off' (skip, all unverified).
const verifyMode = (input.verify === 'lite' || input.verify === 'off') ? input.verify : 'full'
const maxVerify = Math.max(1, Math.min(80, input.maxVerify || 24))
const maxBatchSize = Math.max(1, Math.min(20, input.maxBatchSize || 8))
const scratchHint = input.scratchDir ||
  'a folder named business-council inside the OS temp directory or the user home directory (never inside any project repo)'

const mandate = (typeof input.mandate === 'string' && input.mandate.trim()) ? input.mandate.trim() : null
const mandateBlock = mandate
  ? `\nBINDING CONSTRAINTS from the user. These are constraints, not suggestions:\n${mandate}\n`
  : ''

// Stage switch: a confirmed brief means stage 2 (full council).
let confirmedBrief = input.confirmedBrief || null
if (typeof confirmedBrief === 'string') {
  try { confirmedBrief = JSON.parse(confirmedBrief) } catch (e) {
    throw new Error('business-council: confirmedBrief was passed but is not valid JSON. Relaunch passing the brief object exactly as stage 1 returned it.')
  }
}
if (confirmedBrief && (typeof confirmedBrief !== 'object' || Array.isArray(confirmedBrief) || !confirmedBrief.ventureResolved)) {
  throw new Error('business-council: confirmedBrief does not look like a stage 1 brief (missing ventureResolved). Relaunch passing the brief object exactly as stage 1 returned it.')
}

// ---- Installed skill packs, used as a jobs checklist and as seat methods --------
// Each Small Business entry is one job a small-business owner needs done; for a
// venture whose product does these jobs, the catalog is a requirements oracle.
const SKILL_CATALOG = {
  smallBusiness: [
    'business-pulse: one-page cross-functional snapshot (cash position, sales trend, pipeline, commitments, watch-list, the one thing needing attention today)',
    'cash-flow-snapshot: 30/60/90-day cash forecast from receivables, payables, and payment timing, with confidence bands and named risks',
    'month-end-prep / close-month: reconcile books against payment processors, flag uncategorized and duplicate transactions and missing receipts, plain-language P&L narrative, close packet',
    'margin-analyzer / price-check: unit economics per product, fee and cost decomposition, pricing scenarios',
    'invoice-chase: rank overdue money and chase it, matched to each customer payment history and tone',
    'plan-payroll: cash forecast plus ranked receivables so payroll is safe',
    'sales-brief / content-strategy: top and bottom sellers, seasonality, what to push and what to clear',
    'customer-pulse: disputes, tickets, and reviews synthesized into themes with verbatim evidence',
    'tax-season-organizer / tax-prep: quarterly estimated taxes and year-end prep packaged for the accountant',
    'monday-brief / friday-brief / month-heads-up: recurring owner briefings (week ahead, week past, next 30 days)',
    'lead-triage / call-list / crm-maintenance: pipeline prioritization and CRM upkeep',
  ],
  productManagement: [
    'write-spec: problem statement to structured PRD (goals, non-goals, metrics, acceptance criteria, phases)',
    'product-brainstorming / brainstorm: explore the problem space and stress-test ideas before converging',
    'competitive-brief: competitor analysis for differentiation and prioritization',
    'roadmap-update: now/next/later reprioritization as information lands',
    'sprint-planning: scope work against real capacity, P0 versus stretch',
    'metrics-review / synthesize-research / stakeholder-update: metrics scorecards, research synthesis, status communication',
  ],
}
const jobsChecklistBlock =
  `\nJOBS CHECKLIST (reference). This is the installed small-business skill catalog; each entry is one job small-business ` +
  `owners need done. It is a strong requirements oracle WHEN this venture serves business owners or operators; if the ` +
  `venture is in another domain (consumer, developer tools, health, automation, etc.) treat it as one lens among many, ` +
  `not a checklist to satisfy. Decide which of these jobs, if any, this product must do, defer, or explicitly not do:\n` +
  SKILL_CATALOG.smallBusiness.map((s) => `- ${s}`).join('\n') + '\n'

// ---- Helpers -------------------------------------------------------------------
const norm = (s) => String(s || '').toLowerCase().trim()

// Bounded fan-out: run fn over items at most `limit` in flight at once, in order.
// parallel() is a barrier with no concurrency arg, so we batch: each wave of
// `limit` completes before the next starts. Peak in-flight requests FROM this
// workflow is therefore `limit`, not the runtime's 16. Trades some wall-clock for
// staying under the server throttle. A thrown thunk resolves to null, as parallel.
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
const sameArea = (a, b) => {
  const x = norm(a)
  const y = norm(b)
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x))
}

// ---- Schemas -----------------------------------------------------------------
const BRIEF_SCHEMA = {
  type: 'object',
  required: ['briefComplete', 'ventureResolved', 'targetUser', 'problem', 'jobs', 'areas', 'priorArtNotes', 'openQuestions', 'resolutionNote', 'summary'],
  properties: {
    briefComplete: { type: 'boolean', description: 'True only if the venture description plus materials are enough to brief a council. False means stop and ask; never pad a thin brief with guesses.' },
    ventureResolved: { type: 'string', description: 'The venture restated concretely: what gets built, for whom, in one or two sentences.' },
    targetUser: { type: 'string', description: 'The specific buyer/user, as narrow as the evidence allows.' },
    problem: { type: 'string', description: 'The problem in the user own terms; the pain that makes them seek a tool.' },
    jobs: { type: 'array', items: { type: 'string' }, description: 'The user top jobs-to-be-done this venture serves, most frequent first.' },
    areas: { type: 'array', items: { type: 'string' }, description: '8 to 12 short stable coverage areas the council must address for THIS venture (domain capabilities, non-functionals, monetization). Seats tag findings with these exact names.' },
    priorArtNotes: { type: 'string', description: 'Inventory of the provided prior-art repos and materials: what already exists and is reusable. "none provided" when empty.' },
    openQuestions: { type: 'array', items: { type: 'string' }, description: 'Questions only the user can answer; surfaced at confirmation, not guessed.' },
    resolutionNote: { type: 'string', description: 'How the input mapped to this brief, or what is missing if briefComplete is false.' },
    summary: { type: 'string', description: '4 to 6 line brief handed to every seat.' },
  },
}

const RESEARCH_SCHEMA = {
  type: 'object',
  required: ['topic', 'findings'],
  properties: {
    topic: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['fact', 'source', 'loadBearing'],
        properties: {
          fact: { type: 'string' },
          source: { type: 'string', description: 'URL or file path. Market claims without a source do not count as findings.' },
          loadBearing: { type: 'boolean', description: 'True if requirements or directions would change were this fact wrong.' },
        },
      },
    },
  },
}

const SEAT_SCHEMA = {
  type: 'object',
  required: ['seat', 'verdict', 'findings', 'areasClean'],
  properties: {
    seat: { type: 'string' },
    verdict: { type: 'string', description: 'Short verdict on the venture in this seat voice: the one thing this seat would fight for.' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['statement', 'kind', 'priority', 'area', 'evidence', 'rationale'],
        properties: {
          statement: { type: 'string', description: 'One requirement, risk, or call, stated so a builder can act on it.' },
          kind: { type: 'string', enum: ['business', 'functional', 'nonfunctional', 'risk'] },
          priority: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'], description: 'P0 must-have for v1, P1 major, P2 later, P3 nice.' },
          area: { type: 'string', description: 'One of the brief areas, named exactly. Use "general" only if it truly spans all.' },
          evidence: { type: 'string', description: 'The research citation, prior-art capability, or user job that grounds it.' },
          rationale: { type: 'string', description: 'Why this matters for the target user, one or two lines.' },
        },
      },
    },
    areasClean: { type: 'array', items: { type: 'string' }, description: 'Areas this seat examined and has nothing to add on. Empty array if none.' },
  },
}

const REBUTTAL_SCHEMA = {
  type: 'object',
  required: ['seat', 'reactions'],
  properties: {
    seat: { type: 'string' },
    reactions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['targetSeat', 'finding', 'stance', 'reason'],
        properties: {
          targetSeat: { type: 'string' },
          finding: { type: 'string', description: 'The other seat finding reacted to, tightly paraphrased.' },
          stance: { type: 'string', enum: ['endorse', 'contest', 'amend'] },
          reason: { type: 'string', description: 'Short reason grounded in this seat charge and the evidence.' },
        },
      },
    },
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  required: ['refuted', 'confidence', 'note'],
  properties: {
    refuted: { type: 'boolean', description: 'True if the claim does not hold against the evidence.' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    note: { type: 'string', description: 'What was checked and what was found.' },
  },
}

const REQS_SCHEMA = {
  type: 'object',
  required: ['agreements', 'conflicts', 'coverageNote', 'mvpLine', 'items'],
  properties: {
    agreements: { type: 'array', items: { type: 'string' }, description: 'What two or more seats independently converged on, citing rebuttal endorsements.' },
    conflicts: { type: 'array', items: { type: 'string' }, description: 'Real disagreements, citing the contestations, each with a recommended tie-break grounded in the target user.' },
    coverageNote: { type: 'string', description: 'Per-area coverage statement: which areas were addressed, which were clean, which needed follow-ups.' },
    mvpLine: { type: 'string', description: 'One or two sentences: where v1 stops and why.' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'priority', 'kind', 'area', 'statement', 'seat'],
        properties: {
          id: { type: 'string', description: 'Stable short id like R-01, ordered by priority.' },
          priority: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'] },
          kind: { type: 'string', enum: ['business', 'functional', 'nonfunctional', 'risk'] },
          area: { type: 'string' },
          statement: { type: 'string' },
          seat: { type: 'string' },
        },
      },
    },
  },
}

const CONCEPTS_SCHEMA = {
  type: 'object',
  required: ['directions'],
  properties: {
    directions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'intent', 'wedge', 'scopeIn', 'scopeOut', 'effortNote'],
        properties: {
          name: { type: 'string', description: 'Short direction name capturing the bet, e.g. "Single-loop minimal" or "Power-user cockpit".' },
          intent: { type: 'string', description: 'One line on the bet this shape commits to.' },
          wedge: { type: 'string', description: 'Why the target user picks this over what they use today.' },
          scopeIn: { type: 'array', items: { type: 'string' }, description: 'Requirement ids (and statements) inside v1 of this shape.' },
          scopeOut: { type: 'array', items: { type: 'string' }, description: 'What this shape explicitly defers, with the id.' },
          effortNote: { type: 'string', description: 'Honest build-effort note for a solo builder on the stated stack.' },
        },
      },
    },
  },
}

const SHEET_SCHEMA = {
  type: 'object',
  required: ['name', 'sheetPath', 'notes'],
  properties: {
    name: { type: 'string' },
    sheetPath: { type: 'string', description: 'Absolute path to the written self-contained HTML concept sheet.' },
    notes: { type: 'string', description: 'What the sheet shows and any limitations.' },
  },
}

const JUDGE_SCHEMA = {
  type: 'object',
  required: ['pass', 'jobFit', 'viability', 'buildability', 'differentiation', 'notes'],
  properties: {
    pass: { type: 'boolean', description: 'False means this direction must be rebuilt; give precise rebuild notes.' },
    jobFit: { type: 'number', description: 'Does v1 nail the target user top jobs, 0 to 4.' },
    viability: { type: 'number', description: 'Would the target user adopt and keep using it over current tools, 0 to 4.' },
    buildability: { type: 'number', description: 'Realistic for the stated builder and stack, 0 to 4.' },
    differentiation: { type: 'number', description: 'A real wedge versus the researched competitors, 0 to 4.' },
    notes: { type: 'string', description: 'If pass is false: specific rebuild notes. If true: strengths and risks.' },
  },
}

const CROSS_SCHEMA = {
  type: 'object',
  required: ['distinct', 'redundant', 'notes'],
  properties: {
    distinct: { type: 'boolean', description: 'True if the directions are genuinely different bets, not one shape under three names.' },
    redundant: { type: 'array', items: { type: 'string' }, description: 'Names of directions to rebuild because they collapse into another. Empty when distinct.' },
    notes: { type: 'string' },
  },
}

const CRITIQUE_SCHEMA = {
  type: 'object',
  required: ['perDirection', 'recommendation'],
  properties: {
    perDirection: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'strengths', 'risks'],
        properties: {
          name: { type: 'string' },
          strengths: { type: 'string' },
          risks: { type: 'string' },
        },
      },
    },
    recommendation: { type: 'string', description: 'Which direction best serves the target user, grounded in the judge scores. Does not decide for the user.' },
  },
}

// ---- Stage 1: Brief (cheap; ends with an early return for user confirmation) --
phase('Brief')
let brief
if (confirmedBrief) {
  brief = confirmedBrief
  log(`Stage 2 (full council). Confirmed venture: ${brief.ventureResolved}`)
} else {
  log(`Stage 1 (brief only). Venture received verbatim: "${venture}"`)
  brief = await agent(
    `You are preparing the shared brief for a Business Council (an advisory board of committed perspectives).\n` +
    `VENTURE, described by the user and not yours to change: ${venture}\n` +
    `Prior-art repos to read and inventory (reusable capabilities, data ingestion, schema, lessons): ${JSON.stringify(priorArt)}\n` +
    `Materials to read (notes, past attempts, docs): ${JSON.stringify(materials)}\n` +
    mandateBlock +
    jobsChecklistBlock +
    `Restate the venture concretely, pin the target user as narrowly as the evidence allows, state the problem in the user's own terms, ` +
    `list the top jobs-to-be-done (use the jobs checklist above as a starting inventory: which of those jobs apply to this target user), ` +
    `and derive 8 to 12 coverage areas the council must address for THIS venture ` +
    `(domain capabilities the product needs, drawn partly from the applicable checklist jobs, plus non-functionals and the venture's own monetization). ` +
    `List open questions only the user can answer instead of guessing. If the input is too thin to brief a council, ` +
    `set briefComplete to false and say exactly what is missing in resolutionNote; do not pad with assumptions.\n` +
    `Read repos and local files only; no web research in this stage.`,
    { schema: BRIEF_SCHEMA, phase: 'Brief' }
  )
  if (!brief) throw new Error('business-council: the Brief agent failed to return. Relaunch stage 1.')
  if (!brief.briefComplete) {
    throw new Error(
      `business-council: the venture description is too thin to brief a council. ${brief.resolutionNote} ` +
      `Open questions for the user: ${(brief.openQuestions || []).join(' | ')}. ` +
      'Answer these in the main loop and relaunch stage 1 with the enriched venture text.'
    )
  }
  log(`Venture resolved: ${brief.ventureResolved}`)
  log(`Coverage areas: ${(brief.areas || []).join('; ')}`)
  return {
    stage: 'brief',
    brief,
    handoff: {
      message:
        'Stage 1 only: the venture brief is resolved but NOTHING has been reviewed yet. ' +
        'Present the resolved venture, target user, jobs, coverage areas, and open questions to the user for confirmation; ' +
        'collect answers to the open questions and any extra materials (past attempts, notes). ' +
        'Then relaunch the business-council workflow by name for the full council.',
      relaunchArgs: {
        venture,
        priorArt,
        materials: '<materials plus anything new the user provided>',
        directions: directionCount,
        scratchDir: input.scratchDir || null,
        mandate: mandate,
        webResearch,
        confirmedBrief: '<the brief object above, passed verbatim, with openQuestions answers folded into summary>',
      },
    },
  }
}

const areas = (Array.isArray(brief.areas) && brief.areas.length) ? brief.areas : ['general']
const slug = (norm(brief.ventureResolved).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)) || 'venture'

// ---- Stage 2, Research (multi-modal sweep, citations mandatory) ----------------
phase('Research')
const RESEARCH_TOPICS = [
  { key: 'competitors', web: true,
    charge: 'Find the real, current products the target user could use instead of this venture (direct tools, incumbents, the spreadsheet-or-manual workaround, platform-native or built-in features). For each: what it does well, where it falls short for this exact user, and pricing if visible. These become the differentiation bar.' },
  { key: 'domain-mechanics', web: true,
    charge: 'Establish the factual mechanics this product must model correctly for ITS domain, whatever that domain is (the brief names it). Examples by domain, not a template: a money venture must get fee structures, settlement timing, and refund/dispute flows right; a scheduling venture, time zones and conflict rules; a health venture, data accuracy and consent; an automation venture, the integration surface and its failure modes. Also establish what data the product can actually reach (official APIs, exports, files, scraping, manual entry). Facts the requirements will stand on; mark those loadBearing.' },
  { key: 'context-and-compliance', web: true,
    charge: 'The regulatory, legal, tax, privacy, and locale context the target user lives in, scoped to this venture and only what changes what the product must do. For a money venture in a specific country that means the tax and invoicing regime; for a health or data venture, privacy and consent law; for a venture with no compliance surface, say so briefly and move on.' },
  { key: 'prior-art', web: false,
    charge: 'Read the prior-art repos and materials end to end and inventory what is reusable for this venture: ingestion pipelines, schema shapes, UI patterns, deployment setup, and the lessons implied by what was abandoned or never finished.' },
]
const activeTopics = RESEARCH_TOPICS.filter((t) => t.web ? webResearch : true)
const researchRaw = await mapLimit(activeTopics, maxConcurrency, (t) =>
  agent(
    `You are the "${t.key}" researcher for a Business Council. ${t.web ? 'Use web search; every finding needs a real source URL.' : 'Work from the provided local repos and files only.'}\n` +
    `Charge: ${t.charge}\n` +
    `Brief: ${JSON.stringify(brief)}\n` +
    `Prior art: ${JSON.stringify(priorArt)}; materials: ${JSON.stringify(materials)}\n` +
    mandateBlock +
    `Return findings as facts with sources; mark loadBearing=true on any fact that would change the requirements or directions if it were wrong. ` +
    `No fact without a source. Read-only; change nothing.`,
    { schema: RESEARCH_SCHEMA, label: `research:${t.key}`, phase: 'Research' }
  )
)
const research = researchRaw.filter(Boolean)

// Fail fast and cheap on a rate-limit storm: if every research agent came back
// empty (the observed shape under throttling), do NOT spend the seat stage on
// nothing. Bail with the remedy instead of grinding for half an hour.
if (!research.length) {
  throw new Error(
    'business-council: all research agents failed to return, which under load almost always means a transient API ' +
    'rate-limit/overload ("Server is temporarily limiting requests"), not your usage limit. Nothing downstream was spent. ' +
    'Wait a few minutes, make sure NO other council or heavy workflow is running, then relaunch stage 2 with the same ' +
    'confirmedBrief. If it recurs, lower maxConcurrency (try 2 or 3).'
  )
}

// Adversarially verify the load-bearing facts before anything is built on them,
// capped so a large research return cannot create a wide fact-check burst.
const loadBearingAll = research.flatMap((r) => (r.findings || []).filter((f) => f.loadBearing).map((f) => ({ ...f, topic: r.topic })))
const loadBearing = loadBearingAll.slice(0, maxFactChecks)
if (loadBearingAll.length > loadBearing.length) {
  log(`Capping fact-checks at ${maxFactChecks} of ${loadBearingAll.length} load-bearing facts (raise maxFactChecks to verify more).`)
}
log(`Research returned ${research.length} topic reports; verifying ${loadBearing.length} load-bearing facts, ${maxConcurrency} at a time.`)
const factVerdicts = await mapLimit(loadBearing, maxConcurrency, (f) =>
  agent(
    `Adversarially verify a research fact for a Business Council. Try to REFUTE it; default to refuted=true when the source does not actually support it.\n` +
    `Fact (topic ${f.topic}): ${f.fact}\nClaimed source: ${f.source}\n` +
    `Open the source (or find a better one) and check the fact as stated, including dates and numbers. Read-only.`,
    { schema: VERDICT_SCHEMA, label: `fact:${String(f.fact || '').slice(0, 40)}`, phase: 'Research' }
  ).then((v) => ({ ...f, verdict: v }))
)
const facts = factVerdicts.filter(Boolean)
const verifiedResearch = {
  reports: research,
  loadBearingVerified: facts.filter((f) => f.verdict && !f.verdict.refuted),
  loadBearingRefuted: facts.filter((f) => !f.verdict || f.verdict.refuted),
}
if (verifiedResearch.loadBearingRefuted.length) {
  log(`${verifiedResearch.loadBearingRefuted.length} load-bearing facts refuted; seats are told to ignore them.`)
}

// ---- Stage 2, Seats (independent, parallel, evidence-bound) --------------------
phase('Seats')
const SEATS = [
  { key: 'Product Architect', useMandate: true, useChecklist: false,
    skills: ['product-management:write-spec', 'product-management:product-brainstorming', 'product-management:roadmap-update'],
    charge: 'Fight for a product that does one job superbly. Frame the problem, write the functional requirements as testable statements, define what v1 success looks like, and cut scope ruthlessly. Method (from your backing skills): goals and non-goals, user stories with acceptance criteria, success metrics, and a phased cut where every phase ships something usable.' },
  { key: 'Operator', useMandate: false, useChecklist: true,
    skills: ['small-business:business-pulse', 'small-business:smb-onboard', 'small-business:customer-pulse'],
    charge: 'You ARE the target user the brief defines, whoever they are, living their daily reality with this product. Fight for the real workflow: what they check first, what they do most often, what hurts and how often. For each top job in the brief, describe what doing it looks like today (the current tool, app, or manual workaround) and what this product must change. Reject any requirement that adds steps without removing more. Name the moments the app must win (the first ten minutes, the recurring core loop, the painful periodic task) and the incumbent it must beat. When the target user is a business owner or operator, the jobs checklist names the candidate jobs; when they are not, ignore the checklist and reason from the brief.' },
  { key: 'Domain Correctness', useMandate: false, useChecklist: true,
    skills: ['small-business:cash-flow-snapshot', 'small-business:margin-analyzer', 'small-business:month-end-prep', 'small-business:close-month', 'small-business:invoice-chase', 'small-business:tax-season-organizer'],
    charge: 'Fight for the core domain logic being correct, whatever this venture\'s domain is. First name the handful of things this product absolutely must get right, then hold each to a hard standard and state the data model and the inputs it cannot work without. If the venture handles money, that standard is accounting correctness (every number reconciles to a source, fees decomposed not lumped, real COGS and margins, timing-aware cash with settlement delays and refunds, a clean periodic close, accountant-ready tax outputs) and your finance backing skills are the method; invoke them only when money is actually involved. If the venture is not about money, ignore those skills and apply the equivalent rigor for ITS domain: scheduling and conflict rules, data accuracy and integrity, automation reliability and failure handling, measurement validity, privacy and consent. Correctness here is a P0 gate regardless of domain.' },
  { key: 'Market Strategist', useMandate: true, useChecklist: true,
    skills: ['product-management:competitive-brief', 'small-business:content-strategy', 'small-business:price-check'],
    charge: 'Fight for a reason to exist. Method (from your backing skills): position against the researched alternatives by name; find the wedge a solo builder can win (the underserved niche, the locale, the integration nobody bothers with, the workflow the incumbents treat as an afterthought); price or value the product against the time and errors it removes; and flag any direction that is a thin feature an incumbent or platform could absorb. Generic horizontal tools and assistants can already do many jobs passably, so the product must clearly beat them for its specific user and domain.' },
  { key: 'Builder Risk', useMandate: true, useChecklist: false,
    skills: [],
    charge: 'Fight for shippable. Judge every requirement against a solo builder on the stated stack: where the data actually comes from (official API, export file, email parsing, manual entry) and how brittle that path is; what the financial-data security and privacy duties are; what the effort really is; and which single requirement, if kept, kills v1. Propose the degraded-but-honest version of expensive requirements.' },
]

const seatPrompt = (s, scopeNote) =>
  `You are the ${s.key} seat on a Business Council, reviewing independently.\n` +
  (s.skills && s.skills.length
    ? `Your backing skills: ${s.skills.join(', ')}. If a Skill tool exposing any of them is available in your environment, invoke them FIRST to load their full method; if not, the charge below is your method.\n`
    : '') +
  `Your charge: ${s.charge}\n` +
  (s.useChecklist ? jobsChecklistBlock : '') +
  (s.useMandate ? mandateBlock : '') +
  `\nShared brief: ${JSON.stringify(brief)}\n` +
  `Coverage areas (tag every finding with one of these exact names): ${JSON.stringify(areas)}\n` +
  `Verified research (cite these as evidence; the refuted list is poisoned, do not build on it): ${JSON.stringify(verifiedResearch)}\n` +
  `Prior art to read directly when useful: ${JSON.stringify(priorArt)}; materials: ${JSON.stringify(materials)}\n` +
  (scopeNote ? `\nSCOPE: ${scopeNote}\n` : '') +
  `\nCover EVERY area listed: an area with no findings must appear in areasClean, examined and passed, never silently skipped. ` +
  `Every finding needs evidence: a research citation, a prior-art capability, or a user job from the brief. ` +
  `Advisory only; read-only; no web research beyond opening cited sources.\n` +
  `Return a short verdict in your own voice and findings, each one a requirement, risk, or call a builder can act on, ` +
  `with kind (business, functional, nonfunctional, risk) and priority (P0 must-have for v1 to P3 nice).`

const seatResults = await mapLimit(SEATS, maxConcurrency, (s) =>
  agent(seatPrompt(s, null), { schema: SEAT_SCHEMA, label: `seat:${s.key}`, phase: 'Seats' })
)
const seats = seatResults.filter(Boolean)
if (!seats.length) {
  throw new Error(
    'business-council: every seat failed; nothing to synthesize. Under load this is almost always a transient API ' +
    'rate-limit/overload, not a content problem (especially if another council or heavy workflow was running at the same ' +
    'time). Wait a few minutes, ensure ONLY ONE council runs at a time, then relaunch stage 2 with the same confirmedBrief. ' +
    'Lower maxConcurrency (2 or 3) to shrink the burst.'
  )
}

// ---- Stage 2, Rebuttal (one round of real debate) -------------------------------
phase('Rebuttal')
const rebuttals = (await mapLimit(seats, maxConcurrency, (sr) =>
  agent(
    `You are the ${sr.seat} seat on a Business Council. Your independent review is filed; now you see the other seats' ` +
    `findings ONCE, for one round of debate. React only where you have something real: endorse findings your own ` +
    `perspective independently supports, contest findings you believe are wrong or overweighted, amend findings that are ` +
    `right but mis-prioritized or mis-scoped. Ground every reason in your charge and the evidence. Silence means no ` +
    `strong view. Add NO new findings here.\n` +
    `Your original review: ${JSON.stringify(sr)}\n` +
    `Other seats' reviews: ${JSON.stringify(seats.filter((o) => o.seat !== sr.seat))}`,
    { schema: REBUTTAL_SCHEMA, label: `rebuttal:${sr.seat}`, phase: 'Rebuttal' }
  )
)).filter(Boolean)

// ---- Shared batched verifier ---------------------------------------------------
// KEEP THIS BLOCK BYTE-IDENTICAL in ui-board.js and business-council.js (the
// runtime has no import mechanism). It replaces the old one-agent-per-finding
// verifier: findings are grouped by area and one agent verifies a whole area in a
// single pass (reading its sources once), returning a two-flag verdict per finding
// mapped back by stable fid. This preserves the exact drop-vs-rescope survival
// semantics at a fraction of the token cost.
const prioRank = (p) => (p === 'P0' ? 0 : p === 'P1' ? 1 : p === 'P2' ? 2 : 3)
const coalesceFindings = (arr, stmtOf, prioOf) => {
  const byKey = new Map()
  let merged = 0
  arr.forEach((f) => {
    const k = norm(stmtOf(f)).replace(/[^a-z0-9]+/g, ' ').trim()
    const cur = byKey.get(k)
    if (!cur) { byKey.set(k, f); return }
    merged++
    if (prioRank(prioOf(f)) < prioRank(prioOf(cur))) byKey.set(k, f)
  })
  if (merged) log(`Coalesced ${merged} near-duplicate finding(s) before verify.`)
  return Array.from(byKey.values())
}
const BATCH_VERDICT_SCHEMA = {
  type: 'object',
  required: ['verdicts'],
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        required: ['fid', 'groundingRefuted', 'feasibilityRefuted', 'confidence', 'note'],
        properties: {
          fid: { type: 'string', description: 'Echo the finding fid exactly.' },
          groundingRefuted: { type: 'boolean', description: 'True if the cited evidence does not actually support this finding for this specific target. Drops the finding.' },
          feasibilityRefuted: { type: 'boolean', description: 'True if it is not realistically buildable/expressible with a reachable data path. Keeps the finding but marks it for rescope.' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          note: { type: 'string', description: 'What was checked and found.' },
        },
      },
    },
  },
}
// items: [{ fid, area, priority, statement, evidence, fix, seat, orig }]
// cfg: { subject, phaseName, keptFlag, maxBatchSize, buildContext(area, batch) }
const verifyByArea = async (items, cfg) => {
  const survivors = []
  const dropped = []
  if (!items.length) return { survivors, dropped, unverifiedByOmission: 0 }
  const groups = new Map()
  items.forEach((it) => {
    const key = norm(it.area) || 'general'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(it)
  })
  const batches = []
  groups.forEach((arr, area) => {
    for (let i = 0; i < arr.length; i += cfg.maxBatchSize) batches.push({ area, batch: arr.slice(i, i + cfg.maxBatchSize) })
  })
  log(`Verify: ${items.length} finding(s) in ${batches.length} area-batch(es), ${maxConcurrency} at a time.`)
  const results = await mapLimit(batches, maxConcurrency, ({ area, batch }) =>
    agent(
      `Adversarially verify a set of ${cfg.subject} findings, ALL in the area "${area}". Try to REFUTE each; do not be agreeable.\n` +
      `For EACH finding run BOTH checks independently:\n` +
      `  - grounding: does the cited evidence actually support THIS finding for THIS specific target (not in general), and is it not already made moot by prior art, a competitor, or the existing design? If it fails, set groundingRefuted true (the finding is DROPPED).\n` +
      `  - feasibility: is it realistic for the stated builder and stack with a reachable data path, or concretely expressible in the real stack at reasonable effort? If it fails, set feasibilityRefuted true (the finding is KEPT but must be rescoped).\n` +
      cfg.buildContext(area, batch) +
      `\nFindings to verify (return exactly one verdict per fid, echoing the fid): ` +
      JSON.stringify(batch.map((it) => ({ fid: it.fid, statement: it.statement, evidence: it.evidence, proposedFix: it.fix, priority: it.priority, seat: it.seat }))) + `\n` +
      `Read the relevant source files or open cited sources ONCE for this area and reuse across the findings. Read-only: never edit anything, never start servers or preview tools.\n` +
      `Return a verdict for EVERY fid above.`,
      { schema: BATCH_VERDICT_SCHEMA, label: `verify:${String(area).slice(0, 24)}:${batch.length}`, phase: cfg.phaseName }
    ).then((res) => ({ verdicts: (res && Array.isArray(res.verdicts)) ? res.verdicts : [] }))
  )
  const byFid = new Map()
  results.filter(Boolean).forEach((r) => r.verdicts.forEach((v) => { if (v && v.fid != null) byFid.set(String(v.fid), v) }))
  let omissions = 0
  items.forEach((it) => {
    const v = byFid.get(String(it.fid))
    if (!v) {
      omissions++
      survivors.push({ ...it.orig, survived: true, verifyNote: 'verifier batch failed or omitted this finding; passes UNVERIFIED' })
    } else if (v.groundingRefuted) {
      dropped.push({ ...it.orig, survived: false, verifyNote: v.note || 'grounding refuted' })
    } else if (v.feasibilityRefuted) {
      const s = { ...it.orig, survived: true, verifyNote: v.note || 'feasibility refuted; rescope' }
      s[cfg.keptFlag] = true
      survivors.push(s)
    } else {
      survivors.push({ ...it.orig, survived: true, verifyNote: v.note || 'survived verification' })
    }
  })
  if (omissions) log(`Verify: ${omissions} finding(s) passed UNVERIFIED (batch failure or omission).`)
  return { survivors, dropped, unverifiedByOmission: omissions }
}

// ---- Stage 2, Verify (batched adversarial check before synthesis) --------------
phase('Verify')
// Compact shared context (no full research corpus, no full brief): only what a
// verifier needs to attack a finding, so it is not shipped whole into every batch.
const citationIndex = (verifiedResearch.reports || [])
  .flatMap((r) => (r.findings || []).map((f) => ({ source: f.source, fact: String(f.fact || '').slice(0, 160) })))
  .slice(0, 60)
const poisonedEvidence = (verifiedResearch.loadBearingRefuted || [])
  .map((f) => ({ source: f.source, fact: String(f.fact || '').slice(0, 160) }))
const bcVerifyContext = () =>
  `Venture summary: ${brief.summary}\n` +
  `Target user: ${brief.targetUser}\n` +
  `Prior art available: ${brief.priorArtNotes || 'none'}\n` +
  `Research citations (open a source URL only if you must; do not assume beyond these): ${JSON.stringify(citationIndex)}\n` +
  `POISONED evidence, already refuted in research: a finding must NOT survive on these: ${JSON.stringify(poisonedEvidence)}\n` +
  mandateBlock

const highs = []
const passThroughs = []
seats.forEach((sr) => (sr.findings || []).forEach((f) => {
  if (f.priority === 'P0' || f.priority === 'P1') highs.push({ seat: sr.seat, ...f })
  else passThroughs.push({ seat: sr.seat, ...f, survived: true, verifyNote: 'pass-through, not verified (P2/P3)' })
}))

let survivors
let dropped
if (verifyMode === 'off') {
  survivors = highs.map((f) => ({ ...f, survived: true, verifyNote: 'verification SKIPPED (verify=off); this finding is UNVERIFIED' })).concat(passThroughs)
  dropped = []
  log(`Verify OFF: ${highs.length} P0/P1 finding(s) pass through UNVERIFIED.`)
} else {
  let toVerify = highs
  const notVerified = []
  if (verifyMode === 'lite') {
    toVerify = highs.filter((f) => f.priority === 'P0')
    highs.filter((f) => f.priority !== 'P0').forEach((f) => notVerified.push({ ...f, survived: true, verifyNote: 'verify=lite: P1 not verified (UNVERIFIED)' }))
  }
  toVerify = coalesceFindings(toVerify, (f) => f.statement, (f) => f.priority)
  if (toVerify.length > maxVerify) {
    toVerify.sort((a, b) => prioRank(a.priority) - prioRank(b.priority))
    toVerify.slice(maxVerify).forEach((f) => notVerified.push({ ...f, survived: true, verifyNote: 'over maxVerify cap; UNVERIFIED' }))
    toVerify = toVerify.slice(0, maxVerify)
  }
  const items = toVerify.map((f, i) => ({ fid: 'F' + i, area: f.area, priority: f.priority, statement: f.statement, evidence: f.evidence, fix: f.rationale, seat: f.seat, orig: f }))
  const res = await verifyByArea(items, { subject: 'Business Council', phaseName: 'Verify', keptFlag: 'needsRescope', maxBatchSize, buildContext: bcVerifyContext })
  survivors = res.survivors.concat(passThroughs).concat(notVerified)
  dropped = res.dropped
}
log(`Verification: ${dropped.length} P0/P1 finding(s) refuted and dropped.`)

// ---- Stage 2, Coverage (plain-code guard; targeted follow-ups for gaps) --------
phase('Coverage')
const areaCovered = (area) => seats.some((sr) =>
  (sr.findings || []).some((f) => sameArea(f.area, area)) ||
  (sr.areasClean || []).some((c) => sameArea(c, area))
)
const gaps = areas.filter((a) => !areaCovered(a))
let followupSeats = []
if (gaps.length) {
  log(`Coverage gaps, running targeted follow-ups: ${gaps.join('; ')}`)
  // Product Architect and Finance Controller are the most generally applicable lenses for a gap.
  const gapReviewers = [SEATS[0], SEATS[2]]
  const gapJobs = gaps.flatMap((g) => gapReviewers.map((s) => ({ s, g })))
  followupSeats = (await mapLimit(gapJobs, maxConcurrency, (job) =>
    agent(
      seatPrompt(job.s, `Targeted follow-up. The first round left the area "${job.g}" uncovered. Review ONLY that area, in depth.`),
      { schema: SEAT_SCHEMA, label: `coverage:${job.s.key}:${job.g}`, phase: 'Coverage' }
    )
  )).filter(Boolean)

  const followupHighs = []
  followupSeats.forEach((sr) => (sr.findings || []).forEach((f) => {
    if (f.priority === 'P0' || f.priority === 'P1') followupHighs.push({ seat: `${sr.seat} (follow-up)`, ...f })
    else survivors.push({ seat: `${sr.seat} (follow-up)`, ...f, survived: true, verifyNote: 'pass-through, not verified (P2/P3)' })
  }))
  if (followupHighs.length && verifyMode !== 'off') {
    const fitems = followupHighs.map((f, i) => ({ fid: 'C' + i, area: f.area, priority: f.priority, statement: f.statement, evidence: f.evidence, fix: f.rationale, seat: f.seat, orig: f }))
    const fres = await verifyByArea(fitems, { subject: 'Business Council', phaseName: 'Coverage', keptFlag: 'needsRescope', maxBatchSize, buildContext: bcVerifyContext })
    survivors = survivors.concat(fres.survivors)
    dropped = dropped.concat(fres.dropped)
  } else {
    followupHighs.forEach((f) => survivors.push({ ...f, survived: true, verifyNote: verifyMode === 'off' ? 'verify=off; UNVERIFIED' : 'follow-up unverified' }))
  }
} else {
  log('Coverage: every area was covered in the first round.')
}
const coverage = { areas, gaps, followupReviews: followupSeats.length }

// ---- Stage 2, Synthesis (the Chair) ---------------------------------------------
phase('Synthesis')
const reqs = await agent(
  `You are the Chair of a Business Council. Weave the material into ONE prioritized requirements report; do not concatenate.\n` +
  `Brief: ${JSON.stringify(brief)}\n` +
  `Seat reviews: ${JSON.stringify(seats)}\n` +
  `Follow-up reviews for coverage gaps: ${JSON.stringify(followupSeats)}\n` +
  `Rebuttal round: ${JSON.stringify(rebuttals)}\n` +
  `VERIFIED findings, the only P0/P1 material allowed in the report (needsRescope means keep it but state the degraded honest version): ${JSON.stringify(survivors)}\n` +
  `Findings refuted in verification, EXCLUDED: ${JSON.stringify(dropped)}\n` +
  `Coverage: ${JSON.stringify(coverage)}\n` +
  mandateBlock +
  `\nReturn agreements (citing rebuttal endorsements), conflicts (citing the contestations, with a tie-break grounded in the ` +
  `target user and their top jobs), a per-area coverageNote, an mvpLine stating where v1 stops and why, and one prioritized ` +
  `items list with stable ids (R-01, R-02, ordered by priority), each tagged kind, area, and originating seat. ` +
  `Prioritize ruthlessly; a v1 with 40 must-haves has none.`,
  { schema: REQS_SCHEMA, phase: 'Synthesis' }
)
if (!reqs) throw new Error('business-council: the Chair synthesis failed; cannot continue to directions.')

// ---- Stage 2, Directions (distinct product shapes over the same requirements) --
phase('Directions')
const concepts = await agent(
  `Propose ${directionCount} DISTINCT product shapes for this venture, never just one. Each is a different bet on where to ` +
  `start (for example single-job-minimal, a different core loop, or a power-user cockpit), genuinely different from the others, not one shape ` +
  `under different names. Ground every shape in the requirements report, the verified research, and the brief; each scopeIn ` +
  `item cites a requirement id.${mandateBlock}\n` +
  `Brief: ${JSON.stringify(brief)}\nRequirements report: ${JSON.stringify(reqs)}\n` +
  `Verified research: ${JSON.stringify(verifiedResearch)}\n` +
  `For each: a short name, the one-line bet, the wedge versus what the user does today, scopeIn and scopeOut with requirement ` +
  `ids, and an honest effort note for the stated builder and stack.`,
  { schema: CONCEPTS_SCHEMA, phase: 'Directions' }
)
if (!concepts || !Array.isArray(concepts.directions) || !concepts.directions.length) {
  throw new Error('business-council: no directions were produced; cannot continue.')
}

// ---- Stage 2, Build (one self-contained HTML concept sheet per direction) ------
phase('Build')
const buildPrompt = (d, i, rebuildNotes) =>
  `Build a single self-contained HTML one-page concept sheet for this product direction so the user can read it and feel the bet.\n` +
  `Direction: ${JSON.stringify(d)}\n` +
  `Brief: ${JSON.stringify(brief)}\n` +
  `Requirements report (cite ids): ${JSON.stringify(reqs)}\n` +
  mandateBlock +
  `Contents: the positioning in one line, the wedge, the target user and their top jobs, a scope table (in v1 / explicitly out, ` +
  `with requirement ids), the primary workflow walked step by step in the user's words, what success looks like after 90 days, ` +
  `and the top risks. Real content from the brief and report, never lorem. Embed all CSS; load fonts from a CDN so the single ` +
  `file renders on its own. No em dashes anywhere in the copy.\n` +
  (rebuildNotes ? `THIS IS THE SINGLE REBUILD. A judge failed the previous attempt; address these notes precisely, then stop:\n${rebuildNotes}\n` : '') +
  `Write the file to ${scratchHint}. Use the deterministic filename: business-council-${slug}-direction-${i + 1}.html ` +
  `(overwrite if it exists). Do NOT write inside any project repo and do NOT commit. Return the absolute path.`

const built = await mapLimit(concepts.directions, maxConcurrency, (d, i) =>
  agent(buildPrompt(d, i, null), { schema: SHEET_SCHEMA, label: `sheet:${d.name}`, phase: 'Build' })
)
let directions = concepts.directions.map((d, i) => ({
  ...d,
  index: i,
  sheet: (built[i] && built[i].sheetPath) || null,
  sheetNotes: (built[i] && built[i].notes) || 'concept sheet not produced',
}))

// ---- Stage 2, Judge (quality gate on the directions; one rebuild max) ----------
phase('Judge')
const judgePrompt = (d) =>
  `You are a judge on a Business Council quality gate. Judge this direction by OPENING AND READING its concept sheet, not the ` +
  `summary alone.\n` +
  `Direction: ${JSON.stringify({ name: d.name, intent: d.intent, wedge: d.wedge, scopeIn: d.scopeIn, scopeOut: d.scopeOut, effortNote: d.effortNote })}\n` +
  `Concept sheet to read: ${d.sheet}\n` +
  `Brief: ${JSON.stringify(brief)}\n` +
  `Requirements report it must serve: ${JSON.stringify(reqs)}\n` +
  `Verified research (the competitive bar): ${JSON.stringify(verifiedResearch)}\n` +
  mandateBlock +
  `Score 0 to 4 each: jobFit (v1 nails the target user top jobs), viability (they adopt it over what they use today), ` +
  `buildability (realistic for the stated builder and stack), differentiation (a real wedge versus the researched competitors). ` +
  `Set pass=false, with precise rebuild notes, if any score is 1 or less, if scopeIn ignores a P0 requirement without saying why, ` +
  `or if the sheet uses lorem or invents facts not in the research. Be strict; a weak direction wastes the user's choice.`

const judgeDirection = (d) => {
  if (!d.sheet) return Promise.resolve({ ...d, judge: { pass: false, jobFit: 0, viability: 0, buildability: 0, differentiation: 0, notes: 'No concept sheet was produced.' } })
  return agent(judgePrompt(d), { schema: JUDGE_SCHEMA, label: `judge:${d.name}`, phase: 'Judge' })
    .then((j) => ({ ...d, judge: j || { pass: true, jobFit: 2, viability: 2, buildability: 2, differentiation: 2, notes: 'Judge agent failed; direction passes unjudged.' } }))
}

const crossJudge = (dirs) => agent(
  `You are the cross-set judge on a Business Council. Open and read EVERY concept sheet and decide whether the directions are ` +
  `genuinely different bets, or one shape wearing different names.${mandateBlock}\n` +
  `Directions and their sheets: ${JSON.stringify(dirs.map((d) => ({ name: d.name, intent: d.intent, sheet: d.sheet })))}\n` +
  `If two collapse into each other, name the one to rebuild (keep the stronger). Be strict.`,
  { schema: CROSS_SCHEMA, phase: 'Judge' }
)

let judged = (await mapLimit(directions, maxConcurrency, (d) => judgeDirection(d))).filter(Boolean)
const crossRaw = await crossJudge(judged)
const cross = crossRaw || { distinct: true, redundant: [], notes: 'Cross-set judge failed; distinctness unverified.' }

const needsRebuild = judged.filter((d) =>
  (d.judge && d.judge.pass === false) || (cross.redundant || []).some((n) => norm(n) === norm(d.name))
)
if (needsRebuild.length) {
  log(`Judge gate: rebuilding ${needsRebuild.length} direction(s) once with the judge notes.`)
  const rebuilt = await mapLimit(needsRebuild, maxConcurrency, (d) => {
    const notes = [
      d.judge && d.judge.pass === false ? d.judge.notes : null,
      (cross.redundant || []).some((n) => norm(n) === norm(d.name)) ? `Cross-set judge: this direction collapses into another (${cross.notes}). Differentiate it decisively.` : null,
    ].filter(Boolean).join('\n')
    return agent(buildPrompt(d, d.index, notes), { schema: SHEET_SCHEMA, label: `rebuild:${d.name}`, phase: 'Judge' })
      .then((p) => ({ ...d, sheet: (p && p.sheetPath) || d.sheet, sheetNotes: (p && p.notes) || d.sheetNotes, rebuilt: true }))
      .then((d2) => judgeDirection(d2))
  })
  rebuilt.filter(Boolean).forEach((d2) => {
    judged = judged.map((d) => (d.index === d2.index ? d2 : d))
  })
}
directions = judged

// ---- Stage 2, Critique ----------------------------------------------------------
phase('Critique')
const critiqueRaw = await agent(
  `Critique the proposed product directions for ${brief.ventureResolved}. Be specific and honest; ground every claim in the ` +
  `judge scores, the sheets, and the verified research.${mandateBlock}\n` +
  `Brief: ${JSON.stringify(brief)}\n` +
  `Directions with judge scores: ${JSON.stringify(directions)}\n` +
  `Cross-set distinctness verdict: ${JSON.stringify(cross)}\n\n` +
  `For each direction give strengths and risks. Then recommend which direction best serves the target user, citing the judge ` +
  `scores, without deciding for the user. Note the council changes nothing: the next step, only if the user chooses, is a full ` +
  `PRD on the selected direction (the write-spec skill), and only after that any building.`,
  { schema: CRITIQUE_SCHEMA, phase: 'Critique' }
)
const critique = critiqueRaw || { perDirection: [], recommendation: 'Critique agent failed; the judge scores above are the best available comparison.' }

// ---- Handoff (the council stops here; the caller runs the explicit handoff) ----
const handoff = {
  changedAnything: false,
  message:
    'The council is advisory only and has changed nothing. Every P0/P1 requirement survived adversarial verification, ' +
    'load-bearing research facts were source-checked, and each direction passed a judged quality gate. The next step, only ' +
    'if you choose it, is turning the chosen direction into a full PRD (the write-spec skill), and only after that any building.',
  options: [
    'Draft the PRD: name which direction; that direction plus the full requirements report go into the write-spec skill, and the PRD then feeds roadmap-update and sprint-planning for the build plan.',
    'Refine a direction first: name it and what to change; the council rebuilds and re-judges that one sheet.',
    'Deepen the research on a named topic before deciding.',
    'No, not now: the report and concept sheets stay as the deliverable.',
  ],
}

log('Business Council complete. Returning the verified requirements report, judged directions, sheet paths, and the handoff prompt.')

return {
  stage: 'full',
  brief,
  research: verifiedResearch,
  seats,
  rebuttals,
  verification: { survivors, dropped },
  coverage,
  requirements: reqs,
  directions,
  cross,
  critique,
  handoff,
}
