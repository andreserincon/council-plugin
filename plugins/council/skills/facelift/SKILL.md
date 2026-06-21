---
name: facelift
description: Full UI redesign workflow (formerly named ui-revision) that orchestrates the impeccable, design-taste-frontend, and emil-design-eng skills together to redesign a project's interface safely, in reviewable phases. Use when the user wants to redesign, revise, revamp, overhaul, modernize, facelift, or fully rework the visual design or UI of the current project, or invokes /facelift. Auto-detects project context, proposes a design brief for confirmation, then redesigns screen by screen on a branch without changing behavior. Can take its audit input from the ui-board review. Not for backend-only work or a single isolated component tweak.
---

# Facelift

A guided, phased UI overhaul that drives three design skills as one coordinated pipeline instead of letting them compete. Each owns a different layer:

- `design-taste-frontend` owns DIRECTION (what it should look like).
- `impeccable` owns SYSTEM and the quality GATE (is it correct, consistent, accessible).
- `emil-design-eng` owns FEEL and MOTION CRAFT (does it feel right to use).

Pairs with the `ui-board` skill: the board reviews and produces a verified punch list plus 2 to 3 judged, previewed UI directions, and facelift implements the direction the user chose. The board's output travels in as a handoff packet (Step 2.5) and is tracked to closure: the final report accounts for every punch item.

Facelift implements ONLY the reskin track: presentational changes that preserve behavior. The board tags each punch item reskin or behavior; facelift takes the reskin items and refuses the behavior items. A behavior-change item (new logic, a changed flow, different data shown, new validation, a new surface, or a correctness bug) is not facelift's job and its verify gate will block it. Those go to a build path instead: `write-spec` to formalize each change, then the `forge` build skill to implement it test-gated. The same rule covers greenfield: facelift needs existing screens to operate on, so a net-new app goes to `business-council` then `write-spec` then `forge`, and facelift only returns later to polish the UI once it exists. If a chosen direction mixes presentational and behavioral moves, facelift does the presentational layer and hands the behavioral moves to the build path.

Facelift never certifies its own work. A read-only saved workflow named `facelift-verify` (in the user `.claude/workflows` folder) runs after the pilot screens, after every rollout group, and once over the whole app at the end. It fans out adversarial checks in parallel: behavior preservation against the actual diff (two lenses: logic and data wiring), fidelity to the chosen direction and its preview, accessibility, motion restraint, UX copy, and an anti-AI-tell judge. It returns a pass/warn/fail gate; a failing gate blocks the next group until its blockers are fixed and the gate is re-run. The gate fails closed: a check that does not run counts as a failure.

## Step 0 - Prerequisite check

Confirm the three design skills are available this session: `impeccable`, `design-taste-frontend`, `emil-design-eng`. For any that are missing, name it and tell the user how to install it globally, then copy from `~/.agents/skills` into `~/.claude/skills` if the installer only wrote to the universal folder:

- impeccable: `npx skills add pbakaus/impeccable --global`
- design-taste-frontend: `npx skills add https://github.com/Leonxlnx/taste-skill --skill "design-taste-frontend" --global`
- emil-design-eng: `npx skills add emilkowalski/skill --global`

Degrade gracefully: proceed with whichever skills are present rather than aborting. If `emil-design-eng` is absent, design-taste-frontend's MOTION dial and impeccable's animate command cover motion until it is installed.

Mobbin is an optional reference source for visual inspiration. If the Mobbin MCP tools (the `mcp__mobbin__*` family) are available and authenticated, design-taste-frontend uses them to ground direction in real, current apps. If they are absent or still need authentication, skip every reference pull and proceed; never block a phase on Mobbin.

## Step 1 - Sync gate, then auto-detect project context (no questions yet)

FIRST, the sync gate: run `git fetch` and compare the current branch to its remote before reading anything else. If the branch is behind, sync to the live state before any analysis. Never facelift a stale snapshot; a redesign built on months-old code is wasted work.

Then detect who develops this repo; do not assume. Look for remote-first platform markers: a `lovable-tagger` dev dependency in package.json, its component-tagger plugin in the vite config, an `app.lovable.*` capacitor appId, or lockfile URLs pointing at a Lovable npm registry (equivalent markers from a similar platform count the same way). When markers are present, or the user says the remote is authoritative, the remote IS the source of truth: such platforms develop on the remote, a freshly opened local clone is often many commits stale, and if the local checkout looks far behind what the user is describing, STOP and confirm before proceeding. When no markers are present, treat the repo as self-managed and proceed after the ordinary fetch and compare. Record the verdict (platform-managed: Lovable, or self-managed) for the Step 1 summary; it goes into the handoff packet and frames the drift watch during execution.

Then read the repo so the user types as little as possible. Inspect:

- `package.json` for app name, framework (React, Vue, Svelte, etc.) and UI deps (Tailwind, shadcn/ui, Radix, Motion/Framer, etc.).
- Tailwind config, global CSS, and any theme or token files for the current color, type, spacing, and motion system.
- The routes/pages directory and shared component folders to enumerate every screen and major component.
- `README` and any design-system or brand files for product purpose and an existing design language (name plus traits).

Summarize in 3 to 5 lines: what the app is, the stack, the platform verdict (platform-managed or self-managed), the current design language, and the count of screens and shared components.

## Step 2 - Propose a brief and confirm with the user

Pre-fill a CONTEXT block from Step 1, then use AskUserQuestion to confirm or adjust. List your inferred default first and mark it Recommended:

- Desired feeling: offer 2 to 3 options that fit the app type; the user can type their own. If Mobbin is available, pull a few references for the app's domain and primary screens before this step and let them inform the desired-feeling options and the proposed direction. Reference for ideas and the quality bar, never a template to clone.
- VARIANCE, MOTION, DENSITY: each low / medium / high. Default a data-dense utility app to low / low / high; default a marketing or portfolio site to high / high / low.
- Register: product (utility, data-dense) or brand (marketing, expressive).
- Existing design language: evolve the current system, or replace it. Default to evolve when a coherent system already exists, replace when the UI is default shadcn or inconsistent.
- Conflict tie-breaker: when skills disagree, resolve toward clarity and trust, or toward expressiveness.

Restate the final agreed brief in a few lines before any code.

When facelift starts from a ui-board handoff, most of the brief already exists: adopt the board's brief and the user's chosen direction as-is, confirm only the dials and the tie-breaker, and never re-derive or second-guess the direction the user picked.

## Step 2.5 - Write the handoff packet

Before any code, write one packet file to the same per-project scratch folder the board uses (OUTSIDE the repo, never committed). It is the single source of truth for the whole facelift and every phase reads and updates it. Contents:

- The chosen direction: name, intent, moves, references, and the absolute path to its judged HTML preview.
- The punch list as a checklist: every item gets an ID, its severity, the fix, and a status field (open, addressed, deferred, skipped with reason).
- The binding mandate (banned styles, content-first rules, precedent policy) when the user has one; it stays in force through implementation and final judging, not just at direction time.
- The agreed dials (VARIANCE, MOTION, DENSITY), register, and tie-breaker.
- The screen ledger: every route, page, and shared component from the inventory, each with a status (pending, redesigned, untouched on purpose, deferred).
- The baseline: the commit hash the facelift branch started from, and the paths to the before-screenshots.
- The platform verdict from Step 1 (platform-managed: Lovable, or self-managed) and the remote default branch the drift watch monitors.

When there was no board run, build the packet from Phase 1's reconciled audit instead; the structure is identical.

## Step 3 - Division of labor (lock this before building)

| Skill | Role | Owns |
| --- | --- | --- |
| design-taste-frontend | DIRECTION | Brief inference, anti-templated visual direction, layout archetypes, the VARIANCE / MOTION / DENSITY dials. Sets how MUCH motion is allowed (the budget). Owns the Mobbin precedent pull: gathering real-app references to ground direction as a pattern source and quality bar, never copied. |
| impeccable | SYSTEM + GATE | Tokens (color, type, space), register, IA, hierarchy, accessibility, responsive, anti-pattern detection. Runs audit / critique / polish as the gate. |
| emil-design-eng | FEEL + MOTION CRAFT | The animation decision framework (whether / why / how to animate), custom easing and durations, component micro-interactions (:active, hover, focus, optimistic states), perceived performance, the invisible details. Reviews interaction code with its Before/After/Why table. |

Motion is split so the three never collide:

- design-taste-frontend decides HOW MUCH motion (dial / budget).
- emil-design-eng decides HOW it feels (easing, duration, restraint, craft).
- impeccable ensures motion SERVES usability (feedback and state) and respects reduced-motion.

Conflict hierarchy: motion craft goes to emil-design-eng; motion amount goes to the design-taste-frontend dial; visual direction goes to design-taste-frontend; system, accessibility, IA, and responsive go to impeccable; the overall tie-breaker is the project register plus the user's chosen priority.

## Step 4 - Execute in phases, stopping for sign-off between each

Hard constraints, every phase:

- Preserve ALL existing functionality, routes, data wiring, and business logic. This is a visual and UX revision, not a behavior change.
- The app must build and run after every phase. Never leave it broken.
- Keep accessibility (contrast, focus, keyboard nav) and full responsiveness (mobile and desktop).
- Work on a `facelift` branch. Never commit to the default branch, and never commit on your own anywhere: stage the work, present each group's diff and its before/after screenshots, and commit only on the user's explicit approval. Approved per-group commits double as rollback points.
- Every gate runs through `facelift-verify`; a fail blocks the next group until its blockers are fixed and the gate re-passes. Do not self-certify.
- The drift watch: before the pilot gate and before starting each rollout group, fetch and check whether the remote default branch has moved past the baseline recorded in the packet. If it moved, pause and put the choice to the user: pause the platform's edits until the facelift lands, rebase the facelift branch now, or continue accepting the merge risk. Never rebase or merge on your own. This matters most on platform-managed repos (the platform keeps committing to the default branch) but protects against any concurrent author.
- No em dashes anywhere. Describe changes in plain English in chat; put code in files, not the chat.

Phase 0 - Setup: create the `facelift` branch and record the baseline commit hash in the handoff packet. Inventory every route/page and shared component, list them back, and write them into the packet's screen ledger as pending. Capture BEFORE screenshots of every screen in the main loop (desktop, mobile, and dark mode where supported) and record their paths in the packet; these anchor every later behavior and fidelity comparison. No code changes.

Phase 1 - Audit + direction: all three skills audit the current UI. If the `ui-board` skill is available, run it here to produce this audit as a multi-perspective review, then use its prioritized punch list as the audit input and the chosen direction (with that direction's HTML preview and references) as the starting visual direction. Otherwise: design-taste-frontend first pulls a Mobbin reference set when Mobbin is available (the domain plus each major screen or flow type, on the target platform), then proposes the visual direction and dial settings grounded in that precedent without cloning it; impeccable runs a systematic audit (tokens, IA, hierarchy, accessibility, anti-patterns); emil-design-eng audits interaction and motion using its Before/After/Why table. Reconcile into ONE short design-direction brief (type scale, color roles, spacing, motion principles, top problems). emil's motion must respect the MOTION dial. Show current-vs-proposed and WAIT for approval before writing code.

Phase 2 - Foundation and pilot gate: impeccable implements tokens and base components; design-taste-frontend sets type pairing, layout archetype, and color mood to the dials; emil-design-eng defines the shared motion primitives (custom easing variables, standard durations, the press/hover/focus interaction standard, and the explicit do-not-animate rules for keyboard-initiated and high-frequency actions). Apply to 1 or 2 representative screens first. Keep it building.

The pilot screens are a real gate, not a warm-up: run the drift watch first, then capture their after-screenshots in the main loop, run `facelift-verify` on the pilot (the diff since the baseline, the direction, the mandate, the targeted punch items), fix any blockers until it passes, then present the before/after screenshots, the diff, and the gate verdict, and WAIT for the user's sign-off. Direction problems must surface here, on two screens, not after twenty. No rollout begins until the pilot gate passes and the user approves.

Phase 3 - Rollout: run the drift watch, then apply the system across all screens, ONE logical group at a time (the drift watch repeats before every group). design-taste-frontend drives each screen's redesign, optionally pulling Mobbin references for that screen type (dashboard, settings, onboarding, and so on) to inform the layout archetype, still as reference not template; impeccable enforces consistency and runs the critique/polish gate; emil-design-eng adds motion and micro-interactions within the budget.

After each group: confirm the build is green, capture the group's after-screenshots in the main loop, and run `facelift-verify` with the group's diff base, screens, direction, mandate, and the punch items it targeted. Fix blockers and re-run until the gate passes. Then update the packet (screen ledger statuses, punch-item statuses) and present to the user: a plain-English summary, the staged diff, the before/after screenshots, and the gate verdict. Commit only on the user's approval, then move to the next group.

Phase 4 - Polish + verify: emil-design-eng leads the final feel pass (transitions, micro-interactions, invisible details); impeccable runs the final critique/polish gate; design-taste-frontend confirms it does not look templated. Then the whole-app closeout:

- Run `facelift-verify` once with finalPass over the full branch diff and the complete after-screenshot set; every blocker gets fixed before the report.
- Close the screen ledger: every route, page, and shared component from Phase 0 ends as redesigned, untouched on purpose, or deferred, each with a reason. Silence is never read as done.
- Close the punch list: every item from the handoff packet ends as addressed, deferred, or skipped with a reason, with the verify gate's evidence behind each addressed item.
- Walk every route once and confirm nothing broke. Summarize results, the two closeouts, and anything deferred, in plain English.

## Notes

- Presentation only. If a redesign seems to need a data or schema change, surface it as a separate decision rather than doing it inside the revision.
- Platform leftovers are a separate decision the same way: a tagger dependency and its vite plugin, platform appIds, lockfiles pinned to a platform's private npm cache, hosting, and database-management handover all belong to a dedicated platform-exit task. When a facelift notices them, report them in the phase summary and move on; never fold exit cleanup into a redesign.
- Start at Phase 0 and stop for the user between every phase.
- The `facelift-verify` contract: launch it by name with `args` as a JSON object, never a JSON-encoded string (the harness can hand the script its args stringified; the script parses defensively and throws on missing required fields). Required: `repoPath` (absolute), `baseRef` (the commit the group diff is measured from), and `direction` (name, intent, moves, previewPath). Optional: `groupName`, `screens`, `screenshotsBefore`, `screenshotsAfter`, `punchItems` (with IDs), `mandate`, and `finalPass`. It is read-only and its background agents never start dev servers or preview tools, so capture all screenshots in the main loop and pass the paths in; without after-screenshots it runs code-only and caps the gate at warn.
- A user mandate is binding through implementation, not just at direction time: carry it in the handoff packet and pass it to every `facelift-verify` run so fidelity and anti-AI-tell judge against it.
- If the project has a constitution (`.council/constitution.md`), read it in Step 1, carry it in the packet, and pass its content as the `constitution` arg to every `facelift-verify` run, so a MUST-principle violation is a blocker and a SHOULD violation a warning. The constitution is the durable form of the mandate; they stack when both are present.
- Mobbin references are inspiration only. Never copy a competitor's layout or brand; use precedent to set the quality bar and surface patterns, while design-taste-frontend keeps final say on direction. When Mobbin is unavailable, every reference pull is simply skipped.
- `ui-revision` is the former name of this skill and still works as an alias.
