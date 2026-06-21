---
name: forge
description: Phased, test-gated build workflow that implements NEW behavior, either a greenfield app from scratch or a behavior change on an existing app, driving the design skills (impeccable, design-taste-frontend, emil-design-eng) plus engineering, security, and test discipline as one pipeline. Use when the user wants to build, scaffold, or implement a new app, feature, flow, or behavior change, or invokes /forge. Takes a spec or PRD (from write-spec) and a chosen direction (from business-council or ui-board) and builds it slice by slice on a branch, risk first, gated by forge-verify. The build counterpart of facelift: facelift reskins existing screens without changing behavior, forge creates behavior. Not for behavior-preserving visual redesign (use facelift) or for review only (use ui-board or business-council).
---

# Forge

A guided, phased build that turns a spec into working software, slice by slice, the way `facelift` turns a direction into a redesign. It is the executor for everything facelift cannot do: net-new greenfield apps and behavior changes on existing apps. Where facelift is bound to preserve behavior, forge creates behavior, so its safety net is not behavior preservation but the spec plus tests plus security review, enforced by the `forge-verify` gate.

Forge drives the same craft skills as facelift for the UI it builds (`design-taste-frontend` for direction, `impeccable` for system and accessibility, `emil-design-eng` for feel), and adds the discipline none of those carry: architecture, data wiring, security, and tests.

## Where forge sits in the pipeline

- `business-council` decides a greenfield venture (what, why, scope, the chosen product direction). `ui-board` reviews an existing UI and tags its punch items reskin or behavior.
- `write-spec` formalizes the chosen direction or the behavior items into a PRD with acceptance criteria.
- **forge builds it**, test-gated, slice by slice. This is the step that used to be undefined.
- `ui-board` then `facelift` polish the UI later, once it exists.

Two modes, one workflow:
- **greenfield:** no app yet. Forge scaffolds, proves the risky infrastructure first, then builds vertical slices.
- **behavior-change:** an app exists and a behavior must change or be added (for example a ui-board behavior-tagged punch item). Forge implements it surgically against the existing code.

## Step 0 - Prerequisites

Confirm the design skills for any UI work: `impeccable`, `design-taste-frontend`, `emil-design-eng` (install commands are the same as facelift's Step 0; degrade gracefully if one is missing). Confirm a spec exists: forge needs acceptance criteria to build against and to gate on. If there is only a rough idea, stop and route to `write-spec` first (and, for an unscoped venture, to `business-council` before that). Forge does not invent the spec; it builds it.

## Step 1 - Sync gate, platform detect, read the spec

Same sync gate as facelift: fetch and compare against the remote first; detect whether the repo is platform-managed (Lovable markers: lovable-tagger, the tagger vite plugin, an app.lovable.* appId, Lovable registry URLs in lockfiles) and treat origin as the source of truth when it is; never build on a stale snapshot. For greenfield in a fresh repo there is no remote yet, which is fine.

Then read the inputs end to end: the spec or PRD (the binding acceptance criteria), the chosen direction (the business-council concept sheet or the ui-board direction and its preview), the mandate (builder, stack, locale, security posture), and any prior art to reuse. Also read the project constitution if one exists (by convention `.council/constitution.md` in the repo): its principles are binding, and you pass its content to every gate (forge-analyze, forge-verify) so MUST violations are caught. If there is no constitution and the project has durable rules worth pinning, offer to author one from the template at `~/.claude/templates/council-constitution-template.md`. Restate the build brief in a few lines: what is being built, in what mode, on what stack, against which acceptance criteria, with which non-negotiable constraints.

## Step 2 - Confirm the build brief and the slice plan

Before any code, propose and confirm with the user:

- **Mode:** greenfield or behavior-change.
- **Architecture sketch:** the shape of the thing (for a desktop app: the shell, the process boundaries, the data layer, the external integrations). Name the risky parts explicitly.
- **Risk-ordered slice plan:** break the spec into vertical slices, each one shippable and each tied to acceptance-criteria ids. Order them RISK FIRST: the slices that prove the scary, uncertain infrastructure come before the comfortable UI work. A solo builder should learn whether the hard path holds before building polished screens on top of it.
- **Security posture:** is this build security-sensitive (credentials, financial data, secrets)? If so, security is a first-class blocker in every gate, not a final-pass afterthought.

## Step 2.5 - Write the build packet

Write one packet file to a scratch folder OUTSIDE the repo (never committed), the single source of truth every phase reads and updates:

- The spec as an acceptance-criteria checklist: each criterion an id, its slice, and a status (open, met, partial, deferred with reason).
- The chosen direction (name, intent, moves, the preview or concept-sheet path) for any UI.
- The binding mandate (stack, locale, security posture, banned styles).
- The slice ledger: every planned slice, risk-ordered, each with a status (pending, built, verified, deferred).
- The baseline commit the build branch started from, and the security-sensitive flag.

For a behavior-change build seeded by a ui-board handoff, the behavior-tagged punch items become acceptance criteria here.

## Step 3 - Division of labor

| Layer | Owner | Owns |
| --- | --- | --- |
| Spec and scope | the acceptance criteria | What "done" means per slice; nothing ships unmet without an explicit deferral. |
| Architecture, data, security | engineering judgment | Process and module boundaries, data model and persistence, secrets and IPC, external integrations, the test harness. |
| UI direction | design-taste-frontend | The look, the layout archetype, anti-templated direction, the VARIANCE/MOTION/DENSITY dials. |
| UI system and a11y | impeccable | Tokens, hierarchy, accessibility, responsive, anti-patterns; the craft gate. |
| Feel and motion | emil-design-eng | Interactive states, easing and durations, perceived performance, the invisible details. |

## Step 4 - Execute in phases, stopping for sign-off between each

Hard constraints, every phase:

- The app must build, typecheck, and run after every slice. Never leave it broken.
- Every slice ships something usable end to end (UI plus logic plus data plus tests), not a horizontal layer that does nothing on its own.
- Write tests for new behavior as it is built; the spec's acceptance criteria are the test targets.
- Security is designed in, not bolted on, especially for credentials and financial data.
- Work on a `forge` branch (or the agreed feature branch). Never commit on your own: stage the slice, present its diff, its screenshots, and its gate result, and commit only on the user's explicit approval. Approved per-slice commits are the rollback points.
- Every gate runs through `forge-verify`; a fail blocks the next slice until its blockers are fixed and the gate re-passes. Do not self-certify.
- No em dashes anywhere. Describe changes in plain English in chat; put code in files.

Phase 0 - Setup and the pre-build consistency gate: create the branch and record the baseline. For greenfield, scaffold the skeleton that builds and runs empty (the shell, the build tooling, the test runner) and confirm it starts. For behavior-change, locate and list the exact insertion points the change touches. Write the slice ledger into the packet. Then, BEFORE any feature code, run `forge-analyze` over the requirements, the PRD, the slice plan, and the constitution. It cross-checks that every P0/P1 requirement maps to a slice and every slice cites a requirement, and hunts contradictions, untestable requirements, duplication, bad risk-ordering, and constitution violations. A fail blocks the build until you fix the plan (add a missing slice, cut an orphan, sharpen a vague requirement). This is the cheap gate that stops an expensive build on a misaligned spec. No feature code yet.

Phase 1 - Risk spikes (the distinctive phase): prove the riskiest infrastructure end to end before building features on it. Each spike is a thin vertical proof that the scary path actually works (for a desktop example: that the automation engine runs inside the shell, that the secret store round-trips over the process boundary, that the runner orchestration holds). Run each spike for real and confirm it works; if a spike fails, the architecture changes here, cheaply, before anything is built on top. Gate each spike with forge-verify. Stop for sign-off: the user sees that the hard path holds before committing to the build.

Phase 2 - Foundation: the architecture and data model the slices share, the design system and tokens (design trio), the shared components, and the test harness. Apply to one representative slice. Keep it building and green.

Phase 3 - Vertical-slice rollout: build the spec one risk-ordered slice at a time. Each slice: design-taste-frontend and impeccable and emil-design-eng build the UI to the direction; engineering wires the logic, data, and security; tests cover the slice's acceptance criteria. After each slice, confirm the build is green, run the test suite, capture after-screenshots in the main loop, and run `forge-verify` with the slice diff base, the slice's acceptance criteria as the spec, the mode, the security-sensitive flag, the test output, the screenshots, and the direction. Fix blockers and re-run until the gate passes. Update the packet (slice ledger and criteria statuses), then present to the user: a plain-English summary, the staged diff, the screenshots, the test results, and the gate verdict. Commit only on approval, then the next slice.

Phase 4 - Closeout: run `forge-verify` once with finalPass over the whole build diff and the full screenshot and test set; every blocker is fixed before the report, and on a security-sensitive build the security check must run. Close the slice ledger (every slice built, deferred, or cut with a reason) and the acceptance-criteria checklist (every criterion met, deferred, or cut with a reason, with the gate evidence behind each met one). Walk the primary flows once and confirm they work. Summarize results, the two closeouts, and anything deferred, in plain English.

## Notes

- Forge creates behavior; that is the whole point and the line against facelift. If a task is a behavior-preserving visual redesign of existing screens, it is facelift's, not forge's. If it is review only, it is ui-board's or business-council's.
- The `forge-verify` contract: launch it by name with `args` as a JSON object, never a JSON-encoded string (the harness can hand the script its args stringified; the script parses defensively and throws on missing required fields). Required: `repoPath` (absolute), `baseRef` (the slice diff base), and `spec` (with `acceptanceCriteria`, each an id and text). Optional: `mode` (greenfield or behavior-change), `securitySensitive`, `sliceName`, `testResults` (the build and test output you ran in the main loop), `screenshotsAfter` (captured in the main loop; background agents never start servers or preview tools), `direction` (name plus previewPath, for design fidelity), `mandate`, and `finalPass`. It is read-only; without test output it caps the gate at warn, and on a security-sensitive build it fails closed if the security check did not run.
- The `forge-analyze` contract (the pre-build gate): launch it by name with `args` as a JSON object. Required: `requirements` (array of {id, priority, statement}, from the business-council requirements report or the behavior-tagged punch items) and `slices` (array of {id, name, requirementIds, risk}, your risk-ordered plan). Optional: `specText` (the PRD), `constitution`, `repoPath`, `maxConcurrency` (default 4). It computes requirement-to-slice coverage in plain code, then runs parallel adversarial checks for consistency, clarity, duplication, risk-ordering, and constitution alignment, and returns a severity-rated gate. A fail means fix the plan, not the code. Run it once before building.
- The constitution: durable project principles, by convention `.council/constitution.md` in the repo, authored from `~/.claude/templates/council-constitution-template.md`. Read it in Step 1 and pass its content as the `constitution` arg to forge-analyze and every forge-verify run, so MUST-principle violations are blockers and SHOULD violations warnings. It is the durable form of the `mandate`; when both are present they stack. The Council decision and design skills receive the same principles through their `mandate` arg.
- A user mandate is binding through the whole build: carry it in the packet and pass it to every forge-verify run so design fidelity, security posture, and banned styles all judge against it.
- Data and schema changes ARE in scope for forge (unlike facelift), because forge builds behavior. For Andres's Supabase projects the schema change is still his to run: output the idempotent SQL for him to paste into the dashboard, never migrate from the repo, per his standing rule.
- One heavy workflow at a time: forge-verify fans out parallel checks, so do not run it concurrently with another council or large workflow (see the workflow concurrency rule); run one gate at a time.
