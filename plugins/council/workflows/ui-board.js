export const meta = {
  name: 'ui-board',
  description: 'Deterministic UI Board: confirm the target cheaply, then a quality-gated five-seat review with debate, adversarial verification, coverage guarantees, and judged direction previews.',
  whenToUse: 'Run the multi-perspective design board on a screen. The first launch (no confirmedBrief) resolves the target in seconds for user confirmation; the second launch runs the full board and returns a verified punch list plus 2 to 3 judged UI directions, each with a self-contained HTML preview.',
  phases: [
    { title: 'Brief' },
    { title: 'Visuals' },
    { title: 'Precedent' },
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
// Harness gotcha, verified 2026-06-12 with a zero-agent probe: a by-name
// invocation can deliver args to this script as a JSON-encoded STRING even when
// the caller passed a proper object. Parse defensively before reading any field.
let input = args
for (let i = 0; i < 2 && typeof input === 'string'; i++) {
  try { input = JSON.parse(input) } catch (e) { break }
}
if (typeof input === 'string') input = { target: input } // a bare string is the target itself
if (input === null || typeof input !== 'object' || Array.isArray(input)) input = {}

// A missing target fails loudly HERE, before any agent runs. A full board pass
// is expensive; a silent default to the primary screen costs a full re-run,
// a thrown error costs nothing.
const target = (typeof input.target === 'string' && input.target.trim()) ? input.target.trim() : null
if (!target) {
  throw new Error(
    'ui-board: no review target received (args.target is missing or empty). ' +
    'Resolve the target with the user in the main loop first, then relaunch with args as a JSON object, ' +
    'for example {"target": "settings > bank credentials card plus its two runner CLIs", "platform": "web"}.'
  )
}
const platform = input.platform || 'web'
const directionCount = Math.max(2, Math.min(3, input.directions || 3))
// Where preview HTML files are written. Must be OUTSIDE the user's repo.
const scratchHint = input.scratchDir ||
  'a folder named ui-board-previews inside the OS temp directory or the user home directory (never inside the project repo)'

// Optional binding design mandate (banned styles, content-first rules, precedent policy).
const mandate = (typeof input.mandate === 'string' && input.mandate.trim()) ? input.mandate.trim() : null
const mandateBlock = mandate
  ? `\nBINDING DESIGN MANDATE from the user. These are constraints, not suggestions:\n${mandate}\n`
  : ''

// Screenshots are captured by the MAIN LOOP between stage 1 and stage 2 and passed in.
// Background agents must never start dev servers or preview tools; they hang on an
// access approval no background agent can receive (a prior run froze ~25 minutes).
const screenshotPaths = Array.isArray(input.screenshotPaths)
  ? input.screenshotPaths.filter((p) => typeof p === 'string' && p.trim())
  : []
const visualNotes = (typeof input.visualNotes === 'string' && input.visualNotes.trim()) ? input.visualNotes.trim() : ''

// Mobbin precedent is best pulled in the MAIN LOOP (stage 1.5), where the inline
// images and interactive gallery actually render so the user SEES the mood board.
// A background agent only gets text back, so passing precedent in is how the user
// can visualize it. When provided, the Precedent phase uses it as-is and skips the
// background Mobbin call. Shape: { available, references:[{app, pattern, mobbinUrl}] }.
let precedentIn = input.precedent || null
if (typeof precedentIn === 'string') { try { precedentIn = JSON.parse(precedentIn) } catch (e) { precedentIn = null } }
const precedentProvided = !!(precedentIn && Array.isArray(precedentIn.references) && precedentIn.references.length)

// Stage switch: a confirmed brief means stage 2 (full board). It may arrive
// re-stringified inside args; parse it, and fail loudly if it is unreadable.
let confirmedBrief = input.confirmedBrief || null
if (typeof confirmedBrief === 'string') {
  try { confirmedBrief = JSON.parse(confirmedBrief) } catch (e) {
    throw new Error('ui-board: confirmedBrief was passed but is not valid JSON. Relaunch passing the brief object exactly as stage 1 returned it.')
  }
}
if (confirmedBrief && (typeof confirmedBrief !== 'object' || Array.isArray(confirmedBrief) || !confirmedBrief.targetResolved)) {
  throw new Error('ui-board: confirmedBrief does not look like a stage 1 brief (missing targetResolved). Relaunch passing the brief object exactly as stage 1 returned it.')
}

// ---- Small helpers -------------------------------------------------------------
const norm = (s) => String(s || '').toLowerCase().trim()
const sameSurface = (a, b) => {
  const x = norm(a)
  const y = norm(b)
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x))
}

// ---- Schemas -----------------------------------------------------------------
const BRIEF_SCHEMA = {
  type: 'object',
  required: ['stack', 'register', 'domain', 'targetFound', 'targetResolved', 'resolutionNote', 'surfaces', 'files', 'summary'],
  properties: {
    stack: { type: 'string', description: 'Framework, styling, component lib, animation lib, icons, data layer.' },
    register: { type: 'string', enum: ['product', 'brand', 'mixed'] },
    domain: { type: 'string' },
    targetFound: { type: 'boolean', description: 'True only if the requested target itself was located in the repo. False means the run stops; never substitute another screen to make this true.' },
    targetResolved: { type: 'string', description: 'The REQUESTED target resolved to concrete screen(s), route(s), component(s), or file(s). Never a different surface than the one requested.' },
    resolutionNote: { type: 'string', description: 'One or two lines on how the requested target maps to the resolved surfaces, or what was searched if it was not found.' },
    surfaces: { type: 'array', items: { type: 'string' }, description: 'Every distinct surface the target names (screens, cards, dialogs, CLIs), one short stable name each. Seats tag findings with these exact names.' },
    files: { type: 'array', items: { type: 'string' }, description: 'Concrete repo file paths that implement the target. Seats read these directly.' },
    summary: { type: 'string', description: '3 to 5 line brief handed to every seat.' },
  },
}

const VISUALS_SCHEMA = {
  type: 'object',
  required: ['mode', 'description', 'screenshotPaths'],
  properties: {
    mode: { type: 'string', enum: ['live', 'code-only'] },
    description: { type: 'string', description: 'What the rendered UI looks like at desktop, mobile, and dark mode; key states.' },
    screenshotPaths: { type: 'array', items: { type: 'string' }, description: 'Absolute paths to the screenshots described, empty if code-only.' },
  },
}

const REFS_SCHEMA = {
  type: 'object',
  required: ['available', 'references'],
  properties: {
    available: { type: 'boolean' },
    references: {
      type: 'array',
      items: {
        type: 'object',
        required: ['app', 'pattern'],
        properties: {
          app: { type: 'string' },
          pattern: { type: 'string', description: 'The one quality or pattern this reference demonstrates.' },
          link: { type: 'string' },
          mobbinUrl: { type: 'string', description: 'The canonical Mobbin screen URL, so the main loop can render the reference and the user can open it.' },
        },
      },
    },
  },
}

const SEAT_SCHEMA = {
  type: 'object',
  required: ['seat', 'verdict', 'findings', 'surfacesClean'],
  properties: {
    seat: { type: 'string' },
    verdict: { type: 'string', description: 'Short verdict in this seat voice.' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['finding', 'severity', 'surface', 'evidence', 'fix'],
        properties: {
          finding: { type: 'string' },
          severity: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'] },
          surface: { type: 'string', description: 'The surface this finding is on, named EXACTLY as in the brief surfaces list. Use "general" only if it truly spans all surfaces.' },
          evidence: { type: 'string', description: 'The file path or screenshot that shows it, with the specific detail observed.' },
          fix: { type: 'string', description: 'One or two concrete fixes in the real stack.' },
        },
      },
    },
    surfacesClean: { type: 'array', items: { type: 'string' }, description: 'Surfaces from the brief that this seat examined and found no issues on. Empty array if none.' },
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
    refuted: { type: 'boolean', description: 'True if the finding does not hold against the actual files and screenshots.' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    note: { type: 'string', description: 'What was checked and what was found.' },
  },
}

const PUNCH_SCHEMA = {
  type: 'object',
  required: ['agreements', 'conflicts', 'coverageNote', 'items'],
  properties: {
    agreements: { type: 'array', items: { type: 'string' }, description: 'What two or more seats independently flagged, citing endorsements from the rebuttal round.' },
    conflicts: { type: 'array', items: { type: 'string' }, description: 'Real disagreements, citing contestations from the rebuttal round, each with a recommended tie-break.' },
    coverageNote: { type: 'string', description: 'Per-surface coverage statement: which surfaces were reviewed, which were found clean, which needed follow-ups.' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        required: ['priority', 'finding', 'fix', 'seat', 'executor', 'executorReason'],
        properties: {
          priority: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'] },
          finding: { type: 'string' },
          fix: { type: 'string' },
          seat: { type: 'string' },
          executor: { type: 'string', enum: ['reskin', 'behavior'], description: 'reskin = the fix is purely presentational and changes NO behavior, so facelift can implement it. behavior = the fix changes what the app does (logic, flow steps, what data is shown, validation, a new surface, or a correctness bug), so facelift cannot implement it and it needs a spec-and-build path.' },
          executorReason: { type: 'string', description: 'One line on why this executor, naming the behavior change when executor is behavior.' },
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
        required: ['name', 'intent', 'moves'],
        properties: {
          name: { type: 'string', description: 'Short direction name, e.g. "Quiet editorial".' },
          intent: { type: 'string', description: 'One line on the mood it commits to.' },
          refs: { type: 'array', items: { type: 'string' }, description: 'Apps from the precedent set that exemplify it.' },
          moves: { type: 'array', items: { type: 'string' }, description: '2 to 3 concrete changes on the real screen, each tied to a punch-list item.' },
        },
      },
    },
  },
}

const PREVIEW_SCHEMA = {
  type: 'object',
  required: ['name', 'previewPath', 'notes'],
  properties: {
    name: { type: 'string' },
    previewPath: { type: 'string', description: 'Absolute path to the written self-contained HTML preview.' },
    notes: { type: 'string', description: 'What the preview shows and any limitations.' },
  },
}

const JUDGE_SCHEMA = {
  type: 'object',
  required: ['pass', 'fit', 'distinctiveness', 'feasibility', 'notes'],
  properties: {
    pass: { type: 'boolean', description: 'False means this direction must be rebuilt; give precise rebuild notes.' },
    fit: { type: 'number', description: 'Register and domain fit, 0 to 4.' },
    distinctiveness: { type: 'number', description: 'Does NOT read as AI-built or templated; honors the mandate. 0 to 4.' },
    feasibility: { type: 'number', description: 'Implementable in the real stack named in the brief. 0 to 4.' },
    notes: { type: 'string', description: 'If pass is false: specific rebuild notes. If true: strengths and risks.' },
  },
}

const CROSS_SCHEMA = {
  type: 'object',
  required: ['distinct', 'redundant', 'notes'],
  properties: {
    distinct: { type: 'boolean', description: 'True if the directions are genuinely different takes, not one style under three names.' },
    redundant: { type: 'array', items: { type: 'string' }, description: 'Names of directions that should be rebuilt because they collapse into another direction. Empty when distinct.' },
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
    recommendation: { type: 'string', description: 'Which direction best fits register and domain, grounded in the judge scores. Does not decide for the user.' },
  },
}

// ---- Stage 1: Brief (cheap; ends with an early return for user confirmation) --
phase('Brief')
let brief
if (confirmedBrief) {
  brief = confirmedBrief
  log(`Stage 2 (full board). Confirmed target: ${brief.targetResolved}`)
} else {
  log(`Stage 1 (brief only). Target received verbatim: "${target}"`)
  brief = await agent(
    `You are detecting the shared brief for a UI Board review (platform: ${platform}).\n` +
    `REVIEW TARGET, chosen explicitly by the user and not yours to change: ${target}\n` +
    `Locate this exact target in the repo and resolve it to the concrete screen(s), route(s), component(s), or file(s) ` +
    `that implement it. A target may span several surfaces (for example a settings card plus two CLIs); list every ` +
    `surface it names in the surfaces array with a short stable name each, and list the concrete file paths in files. ` +
    `Never substitute a different screen: do not drift to the dashboard, landing page, or primary screen unless the ` +
    `target literally names it. If you cannot locate the target, set targetFound to false and describe what you ` +
    `searched in resolutionNote; do NOT pick another screen instead.\n` +
    `Then read package.json and config for the stack, README and routes and visible copy for the domain, and decide ` +
    `the register (product/utility vs brand/marketing) for this specific target. ` +
    `Return a tight 3 to 5 line summary that every seat will share.`,
    { schema: BRIEF_SCHEMA, phase: 'Brief' }
  )
  if (!brief) throw new Error('ui-board: the Brief agent failed to return. Relaunch stage 1.')
  if (!brief.targetFound) {
    throw new Error(
      `ui-board: could not locate the requested target "${target}" in this repo. ${brief.resolutionNote} ` +
      'Stopping before any expensive phase. Re-run with a more specific target, such as a route, component, or file path.'
    )
  }
  log(`Target resolved: ${brief.targetResolved}`)
  log(`Surfaces: ${(brief.surfaces || []).join('; ')}`)
  return {
    stage: 'brief',
    brief,
    handoff: {
      message:
        'Stage 1 only: the target was resolved but NOTHING has been reviewed yet. ' +
        'Present the resolved target, surfaces, and files to the user and confirm they match what was asked. ' +
        'Then capture screenshots of the confirmed target in the MAIN LOOP (desktop, mobile, dark mode, key states), ' +
        'saved outside the repo; background agents cannot capture them. ' +
        'Then relaunch the ui-board workflow by name for the full board.',
      relaunchArgs: {
        target,
        platform,
        directions: directionCount,
        scratchDir: input.scratchDir || null,
        mandate: mandate,
        confirmedBrief: '<the brief object above, passed verbatim>',
        screenshotPaths: '<absolute paths to the screenshots captured in the main loop>',
        visualNotes: '<one or two lines on which states were captured>',
      },
    },
  }
}

const surfaces = (Array.isArray(brief.surfaces) && brief.surfaces.length) ? brief.surfaces : [brief.targetResolved]
const briefFiles = Array.isArray(brief.files) ? brief.files : []
const slug = (norm(brief.domain || brief.targetResolved).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)) || 'app'

// ---- Stage 2, Visuals: describe what the main loop captured; never render -----
phase('Visuals')
const visualsRaw = await agent(
  (screenshotPaths.length
    ? `Describe the captured visuals for the UI Board. Brief: ${JSON.stringify(brief)}\n` +
      `Screenshots captured by the caller (open and read EVERY image): ${JSON.stringify(screenshotPaths)}\n` +
      (visualNotes ? `Caller notes on what was captured: ${visualNotes}\n` : '') +
      `Set mode to "live". Write a precise description of the rendered UI at each width and mode shown, the visual ` +
      `hierarchy, and the visible states. Echo the screenshot paths back in screenshotPaths.\n`
    : `No screenshots were provided, so this review is code-only. Brief: ${JSON.stringify(brief)}\n` +
      `Read the source files listed in the brief (files) and describe precisely what the rendered UI looks like based ` +
      `on the code: layout, hierarchy, states, responsive behavior, theming. Set mode to "code-only" with an empty ` +
      `screenshotPaths, and state that visual and feel findings are limited.\n`) +
  `HARD RULE: do NOT start dev servers, preview tools, or browsers; background agents hang waiting on an access ` +
  `approval that can never arrive. Work only from the provided screenshots and the source files.`,
  { schema: VISUALS_SCHEMA, phase: 'Visuals' }
)
const visuals = visualsRaw || { mode: 'code-only', description: 'Visuals agent failed; seats work from source files only.', screenshotPaths: [] }

// ---- Stage 2, Precedent (Mobbin) -----------------------------------------------
// Preferred path: precedent gathered in the main loop (where the gallery rendered
// for the user) and passed in. Fallback: a background agent pulls it text-only.
phase('Precedent')
let refs
if (precedentProvided) {
  refs = { available: true, references: precedentIn.references }
  log(`Using ${precedentIn.references.length} Mobbin references supplied by the main loop (visible to the user as a gallery there).`)
} else {
  log('No precedent supplied by the main loop; pulling text-only references in the background (no visible gallery). For a visible mood board, pull Mobbin in the main loop and pass it in.')
  const refsRaw = await agent(
    `Pull real-world precedent for the UI Board. Brief: ${JSON.stringify(brief)}\n` +
    `Detect the Mobbin tools mcp__mobbin__search_screens and mcp__mobbin__search_flows via tool search. ` +
    `If they are unavailable or need authentication, return available=false with an empty list and do not block.\n` +
    `Otherwise query by the domain plus the target screen or flow type and platform: use search_screens for single ` +
    `screens and search_flows for multi-step journeys. Return 3 to 6 strong, current examples from specific named ` +
    `shipped apps, each with the app name, the one quality it demonstrates, a link, and the canonical mobbinUrl.`,
    { schema: REFS_SCHEMA, phase: 'Precedent' }
  )
  refs = refsRaw || { available: false, references: [] }
}

// ---- Stage 2, Seats (independent, parallel, reading the real source) ----------
phase('Seats')
const SEATS = [
  { key: 'Art Director', lens: 'design-taste-frontend', useMandate: true,
    rubricSkill: 'design-taste-frontend',
    charge: 'Fight for distinctiveness and against looking AI-generated or templated. Own color and type taste. Use the precedent set as the yardstick for templated-versus-distinctive and name the real apps this design echoes or falls short of.' },
  { key: 'Systems Lead', lens: 'impeccable', useMandate: false,
    rubricSkill: 'impeccable',
    charge: 'Fight for a coherent, correct, accessible system: tokens, hierarchy, information architecture, responsive behavior, anti-patterns. Score Nielsen 10 heuristics 0 to 4 and flag cognitive-load problems. You are the quality gate.' },
  { key: 'Design Engineer', lens: 'emil-design-eng', useMandate: false,
    rubricSkill: 'emil-design-eng',
    charge: 'Fight for feel: the eight interactive states, motion restraint, custom easing and durations, perceived performance, the invisible details. Argue against animating high-frequency or keyboard-initiated actions. Use a Before/After/Why frame.' },
  { key: 'Product', lens: 'jobs-to-be-done', useMandate: false, rubricSkill: null,
    charge: 'Fight for the user real job in the domain, not feature completeness. State the primary job in one sentence, count the steps, check the primary action is the most prominent element, check the screen shows only what the decision needs, and check empty/loading/error states serve the core task.' },
  { key: 'Content', lens: 'ux-writing', useMandate: false, rubricSkill: null,
    charge: 'Fight for plain consistent language. Button labels are verb plus object. Terms are consistent and use the domain real words. Error messages name the problem and the fix near the field. Empty states say what the thing is and how to fill it. Numbers, dates, currency formatted for locale. No jargon, no em dashes.' },
]

const seatPrompt = (s, scopeNote) =>
  `You are the ${s.key} seat on a UI Board, reviewing independently. Apply the ${s.lens} perspective.\n` +
  (s.rubricSkill
    ? `FIRST load your rubric: invoke the \`${s.rubricSkill}\` skill via the Skill tool if it is available in your environment, and apply its method. If it is not available, proceed with the charge below alone.\n`
    : '') +
  `Your charge: ${s.charge}\n` +
  (s.useMandate ? mandateBlock : '') +
  `\nShared brief: ${JSON.stringify(brief)}\n` +
  `Surfaces under review (tag every finding with one of these exact names): ${JSON.stringify(surfaces)}\n` +
  `Source files: READ the actual code at these paths, do not work from the description alone: ${JSON.stringify(briefFiles)}\n` +
  `Visual mode: ${visuals.mode}. Visual description: ${visuals.description}\n` +
  `Screenshots to read (open each path to see the rendered UI): ${JSON.stringify(visuals.screenshotPaths)}\n` +
  `Precedent available: ${refs.available}. References: ${JSON.stringify(refs.references)}\n` +
  (scopeNote ? `\nSCOPE: ${scopeNote}\n` : '') +
  `\nCover EVERY surface listed: a surface with no findings must appear in surfacesClean, examined and passed, never silently skipped. ` +
  `Each finding needs evidence: the file path or screenshot that shows it, with the specific detail.\n` +
  `Review only. Never edit code, never start dev servers, preview tools, or browsers. ` +
  `Return a short verdict in your own voice and a findings list, each with a severity ` +
  `(P0 blocking, P1 major, P2 minor, P3 polish) and one or two concrete fixes expressed in the real stack.`

const seatResults = await parallel(SEATS.map((s) => () =>
  agent(seatPrompt(s, null), { schema: SEAT_SCHEMA, label: `seat:${s.key}`, phase: 'Seats' })
))
const seats = seatResults.filter(Boolean)
if (!seats.length) throw new Error('ui-board: every seat failed; nothing to synthesize.')

// ---- Stage 2, Rebuttal (one round of real debate before synthesis) ------------
phase('Rebuttal')
const rebuttals = (await parallel(seats.map((sr) => () =>
  agent(
    `You are the ${sr.seat} seat on a UI Board. Your independent review is filed; now you see the other seats' ` +
    `findings ONCE, for one round of debate. React only where you have something real: endorse findings your own ` +
    `perspective independently supports, contest findings you believe are wrong or overweighted, amend findings that ` +
    `are right but mis-scoped or mis-prioritized. Ground every reason in your charge and the evidence; cite files or ` +
    `screenshots where you can. Do not react to everything; silence means no strong view. Add NO new findings here.\n` +
    `Your original review: ${JSON.stringify(sr)}\n` +
    `Other seats' reviews: ${JSON.stringify(seats.filter((o) => o.seat !== sr.seat))}`,
    { schema: REBUTTAL_SCHEMA, label: `rebuttal:${sr.seat}`, phase: 'Rebuttal' }
  )
))).filter(Boolean)

// ---- Stage 2, Verify (adversarial check of every P0/P1 before the punch list) -
phase('Verify')
const verifyOne = (f, lens, phaseName) => agent(
  `Adversarially verify a UI Board finding. Your job is to try to REFUTE it; if the evidence is not actually there, ` +
  `say refuted=true. Do not be agreeable.\n` +
  `Lens: ${lens}.\n` +
  `Finding (${f.severity}, from the ${f.seat} seat, surface "${f.surface}"): ${f.finding}\n` +
  `Claimed evidence: ${f.evidence}\n` +
  `Proposed fix: ${f.fix}\n` +
  `Brief: ${JSON.stringify(brief)}\n` +
  `Source files: ${JSON.stringify(briefFiles)}\n` +
  `Screenshots: ${JSON.stringify(visuals.screenshotPaths)}\n` +
  `Read the actual files and screenshots yourself. ` +
  (lens === 'fix feasibility'
    ? `Check that the proposed fix is concretely expressible in the real stack named in the brief, at reasonable effort.`
    : `Check that the problem actually exists as described, where described.`) +
  ` Never edit code, never start servers or preview tools.`,
  { schema: VERDICT_SCHEMA, label: `verify:${f.severity}:${String(f.finding || '').slice(0, 40)}`, phase: phaseName || 'Verify' }
)

const judgeSurvival = (f, verdicts) => {
  const vs = verdicts.filter(Boolean)
  if (!vs.length) return { ...f, survived: true, verifyNote: 'verifier agent failed; finding passes UNVERIFIED' }
  const observationRefuted = vs.some((v) => v.lens !== 'fix feasibility' && v.refuted)
  const feasibilityRefuted = vs.some((v) => v.lens === 'fix feasibility' && v.refuted)
  if (observationRefuted) return { ...f, survived: false, verifyNote: vs.map((v) => v.note).join(' | ') }
  if (feasibilityRefuted) return { ...f, survived: true, fixNeedsRework: true, verifyNote: vs.map((v) => v.note).join(' | ') }
  return { ...f, survived: true, verifyNote: vs.map((v) => v.note).join(' | ') }
}

const toVerify = []
seats.forEach((sr) => (sr.findings || []).forEach((f) => {
  if (f.severity === 'P0' || f.severity === 'P1') toVerify.push({ seat: sr.seat, ...f })
}))
log(`Adversarially verifying ${toVerify.length} P0/P1 findings; P2/P3 pass through unverified.`)

const verifiedHighs = (await parallel(toVerify.map((f) => () => {
  if (f.severity === 'P0') {
    return parallel([
      () => verifyOne(f, 'observation correctness').then((v) => v && { ...v, lens: 'observation correctness' }),
      () => verifyOne(f, 'fix feasibility').then((v) => v && { ...v, lens: 'fix feasibility' }),
    ]).then((vs) => judgeSurvival(f, vs))
  }
  return verifyOne(f, 'observation correctness and fix feasibility')
    .then((v) => judgeSurvival(f, v ? [{ ...v, lens: 'combined' }] : []))
}))).filter(Boolean)

const passThroughs = []
seats.forEach((sr) => (sr.findings || []).forEach((f) => {
  if (f.severity === 'P2' || f.severity === 'P3') passThroughs.push({ seat: sr.seat, ...f, survived: true, verifyNote: 'pass-through, not verified (P2/P3)' })
}))
let survivors = verifiedHighs.filter((f) => f.survived).concat(passThroughs)
let dropped = verifiedHighs.filter((f) => !f.survived)
log(`Verification: ${verifiedHighs.length - dropped.length} of ${toVerify.length} P0/P1 findings survived; ${dropped.length} refuted and dropped.`)

// ---- Stage 2, Coverage (plain-code guard; targeted follow-ups for gaps) -------
phase('Coverage')
const surfaceCovered = (surface) => seats.some((sr) =>
  (sr.findings || []).some((f) => sameSurface(f.surface, surface)) ||
  (sr.surfacesClean || []).some((c) => sameSurface(c, surface))
)
const gaps = surfaces.filter((s) => !surfaceCovered(s))
let followupSeats = []
if (gaps.length) {
  log(`Coverage gaps, running targeted follow-ups: ${gaps.join('; ')}`)
  // Systems Lead and Product are the most generally applicable lenses for a gap.
  const gapReviewers = [SEATS[1], SEATS[3]]
  followupSeats = (await parallel(gaps.flatMap((g) => gapReviewers.map((s) => () =>
    agent(
      seatPrompt(s, `Targeted follow-up. The first round left the surface "${g}" uncovered. Review ONLY that surface, in depth.`),
      { schema: SEAT_SCHEMA, label: `coverage:${s.key}:${g}`, phase: 'Coverage' }
    )
  )))).filter(Boolean)

  const followupHighs = []
  followupSeats.forEach((sr) => (sr.findings || []).forEach((f) => {
    if (f.severity === 'P0' || f.severity === 'P1') followupHighs.push({ seat: `${sr.seat} (follow-up)`, ...f })
    else survivors.push({ seat: `${sr.seat} (follow-up)`, ...f, survived: true, verifyNote: 'pass-through, not verified (P2/P3)' })
  }))
  const followupVerified = (await parallel(followupHighs.map((f) => () =>
    verifyOne(f, 'observation correctness and fix feasibility', 'Coverage')
      .then((v) => judgeSurvival(f, v ? [{ ...v, lens: 'combined' }] : []))
  ))).filter(Boolean)
  survivors = survivors.concat(followupVerified.filter((f) => f.survived))
  dropped = dropped.concat(followupVerified.filter((f) => !f.survived))
} else {
  log('Coverage: every surface was covered in the first round.')
}
const coverage = { surfaces, gaps, followupReviews: followupSeats.length }

// ---- Stage 2, Synthesis (the Chair) --------------------------------------------
phase('Synthesis')
const punch = await agent(
  `You are the Chair of a UI Board. Weave the material into one report, do not concatenate it.\n` +
  `Brief: ${JSON.stringify(brief)}\n` +
  `Seat reviews: ${JSON.stringify(seats)}\n` +
  `Follow-up reviews for coverage gaps: ${JSON.stringify(followupSeats)}\n` +
  `Rebuttal round (endorsements, contestations, amendments between seats): ${JSON.stringify(rebuttals)}\n` +
  `VERIFIED findings, the only P0/P1 material allowed on the punch list (fixNeedsRework means keep the finding but ` +
  `rework its fix): ${JSON.stringify(survivors)}\n` +
  `Findings refuted in verification, EXCLUDED from the punch list: ${JSON.stringify(dropped)}\n` +
  `Coverage: ${JSON.stringify(coverage)}\n\n` +
  `Return agreements (what two or more seats independently flagged, citing the rebuttal endorsements), conflicts ` +
  `(citing the actual contestations, naming who wants what, with a tie-break keyed off register: product leans to ` +
  `clarity and trust, brand can lean to expressiveness), a coverageNote stating per-surface coverage, and one ` +
  `prioritized punch list across all seats, each item tagged P0 to P3 with the concrete fix and which seat raised it. ` +
  `Prioritize ruthlessly; if everything is important, nothing is.\n` +
  `Classify each item's executor. "reskin" means the fix is purely presentational and changes NO behavior, so the ` +
  `facelift skill can implement it safely. "behavior" means the fix changes what the app does (logic, flow steps, what ` +
  `data is shown, validation, a new surface, or a correctness bug), which facelift is forbidden to touch; those go to a ` +
  `build path. Be conservative: if in doubt whether a fix is purely visual, tag it behavior. Give a one-line ` +
  `executorReason, naming the behavior change when the executor is behavior.`,
  { schema: PUNCH_SCHEMA, phase: 'Synthesis' }
)
if (!punch) throw new Error('ui-board: the Chair synthesis failed; cannot continue to directions.')

// Route the punch list by executor in plain code, so the handoff can name the
// right tool per item instead of dumping everything on facelift.
const punchItems = Array.isArray(punch.items) ? punch.items : []
const reskinItems = punchItems.filter((it) => it.executor !== 'behavior')
const behaviorItems = punchItems.filter((it) => it.executor === 'behavior')
const routing = {
  reskin: reskinItems,
  behavior: behaviorItems,
  note:
    `${reskinItems.length} item(s) are reskins facelift can implement; ${behaviorItems.length} item(s) require behavior ` +
    `change and must go to a build path (write-spec then the forge build skill), not facelift.`,
}
log(`Routing: ${reskinItems.length} reskin, ${behaviorItems.length} behavior-change.`)

// ---- Stage 2, Directions (concepts grounded in mandate and punch list) --------
phase('Directions')
const concepts = await agent(
  `Propose ${directionCount} DISTINCT UI directions for ${brief.targetResolved}, never just one. Each is a coherent take ` +
  `(for example "quiet editorial", "bold and warm", "dense and utilitarian"), genuinely different from the others, ` +
  `not one style under different names. Ground them in the brief, the precedent, and the punch list, without cloning ` +
  `any single app.${mandateBlock}\n` +
  `Brief: ${JSON.stringify(brief)}\nPrecedent: ${JSON.stringify(refs.references)}\nPunch list: ${JSON.stringify(punch.items)}\n\n` +
  `For each direction return a short name, a one-line intent, the precedent apps that exemplify it, and 2 to 3 concrete ` +
  `moves on the real screen, each tied to a punch-list item.`,
  { schema: CONCEPTS_SCHEMA, phase: 'Directions' }
)
if (!concepts || !Array.isArray(concepts.directions) || !concepts.directions.length) {
  throw new Error('ui-board: no directions were produced; cannot continue.')
}

// ---- Stage 2, Build (one self-contained HTML preview per direction) -----------
phase('Build')
const buildPrompt = (d, i, rebuildNotes) =>
  `Build a single self-contained HTML preview for this UI direction so the user can open it and feel the mood.\n` +
  `Direction: ${JSON.stringify(d)}\n` +
  `Brief: ${JSON.stringify(brief)}\n` +
  `Pull the user's REAL content (headings, labels, copy, real numbers) by reading the source files: ${JSON.stringify(briefFiles)}. Never lorem.\n` +
  mandateBlock +
  `Fidelity is style-tile-plus-hero: the color palette, type specimens, the core UI atoms (buttons, inputs, cards), and ` +
  `ONE representative section rebuilt in this direction. Embed all CSS in the file and load fonts from a CDN so the ` +
  `single file renders on its own. No em dashes anywhere in the preview copy; use periods, commas, parentheses.\n` +
  (rebuildNotes ? `THIS IS THE SINGLE REBUILD. A judge failed the previous attempt; address these notes precisely, then stop:\n${rebuildNotes}\n` : '') +
  `Write the file to ${scratchHint}. Use the deterministic filename: ui-board-${slug}-direction-${i + 1}.html ` +
  `(overwrite it if it exists). Do NOT write anything inside the user repo and do NOT commit. ` +
  `Return the absolute path to the file you wrote.`

const built = await parallel(concepts.directions.map((d, i) => () =>
  agent(buildPrompt(d, i, null), { schema: PREVIEW_SCHEMA, label: `preview:${d.name}`, phase: 'Build' })
))
let directions = concepts.directions.map((d, i) => ({
  ...d,
  index: i,
  preview: (built[i] && built[i].previewPath) || null,
  previewNotes: (built[i] && built[i].notes) || 'preview not produced',
}))

// ---- Stage 2, Judge (quality gate on the built previews; one rebuild max) -----
phase('Judge')
const judgePrompt = (d) =>
  `You are a judge on a UI Board quality gate. Judge this direction by OPENING AND READING its preview file, not the ` +
  `description alone.\n` +
  `Direction: ${JSON.stringify({ name: d.name, intent: d.intent, moves: d.moves, refs: d.refs })}\n` +
  `Preview file to read: ${d.preview}\n` +
  `Brief: ${JSON.stringify(brief)}\n` +
  `Punch list it must serve: ${JSON.stringify(punch.items)}\n` +
  mandateBlock +
  `Score 0 to 4 each: fit (register and domain), distinctiveness (does NOT read as AI-built or templated, honors the ` +
  `mandate; violating a banned style is an automatic fail), feasibility (expressible in the real stack). ` +
  `Set pass=false, with precise rebuild notes, if any score is 1 or less, if the preview violates the mandate, ` +
  `or if it uses lorem instead of the real content. Be strict; a weak direction wastes the user's choice.`

const judgeDirection = (d) => {
  if (!d.preview) return Promise.resolve({ ...d, judge: { pass: false, fit: 0, distinctiveness: 0, feasibility: 0, notes: 'No preview file was produced.' } })
  return agent(judgePrompt(d), { schema: JUDGE_SCHEMA, label: `judge:${d.name}`, phase: 'Judge' })
    .then((j) => ({ ...d, judge: j || { pass: true, fit: 2, distinctiveness: 2, feasibility: 2, notes: 'Judge agent failed; direction passes unjudged.' } }))
}

const crossJudge = (dirs) => agent(
  `You are the cross-set judge on a UI Board. Open and read EVERY preview file and decide whether the directions are ` +
  `genuinely distinct takes, or one style wearing different names (the classic AI tell).${mandateBlock}\n` +
  `Directions and their preview files: ${JSON.stringify(dirs.map((d) => ({ name: d.name, intent: d.intent, preview: d.preview })))}\n` +
  `If two collapse into each other, name the one that should be rebuilt (keep the stronger). Be strict.`,
  { schema: CROSS_SCHEMA, phase: 'Judge' }
)

let judged = (await parallel(directions.map((d) => () => judgeDirection(d)))).filter(Boolean)
const crossRaw = await crossJudge(judged)
const cross = crossRaw || { distinct: true, redundant: [], notes: 'Cross-set judge failed; distinctness unverified.' }

const needsRebuild = judged.filter((d) =>
  (d.judge && d.judge.pass === false) || (cross.redundant || []).some((n) => norm(n) === norm(d.name))
)
if (needsRebuild.length) {
  log(`Judge gate: rebuilding ${needsRebuild.length} direction(s) once with the judge notes.`)
  const rebuilt = await parallel(needsRebuild.map((d) => () => {
    const notes = [
      d.judge && d.judge.pass === false ? d.judge.notes : null,
      (cross.redundant || []).some((n) => norm(n) === norm(d.name)) ? `Cross-set judge: this direction collapses into another (${cross.notes}). Differentiate it decisively.` : null,
    ].filter(Boolean).join('\n')
    return agent(buildPrompt(d, d.index, notes), { schema: PREVIEW_SCHEMA, label: `rebuild:${d.name}`, phase: 'Judge' })
      .then((p) => ({ ...d, preview: (p && p.previewPath) || d.preview, previewNotes: (p && p.notes) || d.previewNotes, rebuilt: true }))
      .then((d2) => judgeDirection(d2))
  }))
  rebuilt.filter(Boolean).forEach((d2) => {
    judged = judged.map((d) => (d.index === d2.index ? d2 : d))
  })
}
directions = judged

// ---- Stage 2, Critique (consumes the judge scores) -----------------------------
phase('Critique')
const critiqueRaw = await agent(
  `Critique the proposed UI directions for ${brief.targetResolved}. Be specific and honest; ground every claim in the ` +
  `judge scores and the previews.${mandateBlock}\n` +
  `Brief: ${JSON.stringify(brief)}\n` +
  `Directions with judge scores: ${JSON.stringify(directions)}\n` +
  `Cross-set distinctness verdict: ${JSON.stringify(cross)}\n\n` +
  `For each direction give its strengths and its risks. Then recommend which direction best fits the register and ` +
  `domain, citing the judge scores, without deciding for the user. Note that the board changes nothing: the next step, ` +
  `only if the user chooses, is the facelift skill for the reskin items on the selected direction, while any ` +
  `behavior-change items go to a spec-and-build path (write-spec then the forge build skill), not facelift.`,
  { schema: CRITIQUE_SCHEMA, phase: 'Critique' }
)
const critique = critiqueRaw || { perDirection: [], recommendation: 'Critique agent failed; judge scores above are the best available comparison.' }

// ---- Handoff (the workflow stops here; the caller runs the explicit handoff) --
// The board never triggers facelift itself. It returns this so the main loop can
// state the next step out loud and ask the user before anything is built.
const handoff = {
  changedAnything: false,
  routing,
  message:
    'The board is review only and has changed nothing in your repo. Every P0/P1 finding survived adversarial ' +
    'verification, and each direction preview passed a quality gate. The punch list is routed by executor: ' +
    `${routing.note} Present BOTH tracks to the user. The reskin track goes to the facelift skill (the chosen direction, ` +
    'screen by screen on a branch, behavior preserved). The behavior track goes to a build path: write-spec to formalize ' +
    'each change, then the forge build skill to implement it test-gated. Do not send behavior items to facelift; its ' +
    'verify gate will block them.',
  options: [
    'Reskin track to facelift: name the direction; the reskin items plus that direction go to facelift.',
    'Behavior track to build: the behavior items go to write-spec, then the forge build skill.',
    'Both tracks: facelift the reskins, and spec-and-build the behavior items.',
    'Only specific items I will name (I will say which tool each goes to).',
    'No, not now: the report and previews stay as the deliverable.',
  ],
}

log('UI Board complete. Returning the verified report, judged directions, preview paths, and the handoff prompt.')

return {
  stage: 'full',
  brief,
  visuals,
  refs,
  seats,
  rebuttals,
  verification: { survivors, dropped },
  coverage,
  punch,
  directions,
  cross,
  critique,
  handoff,
}
