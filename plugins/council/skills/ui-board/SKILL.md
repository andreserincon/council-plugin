---
name: ui-board
description: Read-only UI and UX review council ("the board") that convenes five design perspectives on a screen (visual direction, design system plus accessibility, motion and feel, product/jobs-to-be-done, and content/UX writing), then synthesizes them into one prioritized punch list and two to three UI directions, each with a Mobbin mood board and a rendered, self-contained HTML preview you can open. Use when the user wants a multi-perspective design review, critique, or board/council opinion on an interface, or invokes /ui-board. Domain-agnostic: auto-detects stack, register, and domain in any repo. Reviews the rendered UI via screenshots and the live UX via interaction. Never changes code.
---

# UI Board

A read-only design review. The board convenes a panel of committed perspectives, each reviews the same target independently, and a Chair synthesizes their opinions into one prioritized punch list and two to three previewed UI directions. It is read-only with respect to the user's project: it never edits the user's code, screens, or repository, and never starts the redesign. To help the user choose, it produces standalone, disposable style previews, one self-contained HTML file per direction, in a scratch folder outside the project. These previews are decision aids, not the redesign, and are never wired into or committed to the user's app. Acting on the advice is a separate step the user explicitly opts into at the very end.

## What makes the board work

- **Independent voices.** Each seat reviews without seeing the others first, so they genuinely disagree. Run the seats as parallel sub-agents when that is available; otherwise review sequentially and say that independence was degraded.
- **Committed biases.** Each seat fights for one thing. The value of the board is the tension between seats, not forced consensus.
- **A shared brief.** Stack, register, and domain are detected once and handed to every seat, so the same tool adapts to any project.
- **Real visuals.** Screenshots for the UI, live interaction for the UX and the feel.

## How the board runs (orchestration)

The board is a full multi-phase process, not a quick inline opinion. Always run the entire sequence in order: detect the brief, capture visuals, pull precedent, convene the seats, synthesize the punch list, build the previewed directions, then stop and hand off. Do not degrade into a couple of lighter inline sub-agents that skip phases.

- When a Workflow or background-orchestration tool is available, run the board as the saved workflow named `ui-board` that ships alongside this skill (in the user `.claude/workflows` folder), so it is deterministic and reproducible. It runs in TWO launches. Launch 1 (brief only) resolves the target and returns in seconds; present the resolved target, surfaces, and files to the user and confirm they match what was asked before anything expensive runs. Then capture screenshots in the main loop (Step 2) and relaunch with the confirmed brief for the full board. When no workflow tool is available, run the same phases inline, in order, and say so.
- The workflow args contract: pass `args` as a JSON object, never as a JSON-encoded string. Launch 1 takes a required `target` (the user's wording plus any routes, components, or file paths already known) and optional `platform`, `directions`, `scratchDir` (a per-project folder outside the repo), and `mandate` (binding design constraints; see Rules). Launch 2 repeats those plus `confirmedBrief` (the brief object exactly as launch 1 returned it), `screenshotPaths`, `visualNotes`, and `precedent` (the Mobbin reference set you pulled in the main loop, so the board uses the same set the user saw; see Step 2.5). The workflow throws when no target arrives; that is deliberate, a loud cheap failure instead of an expensive review of the wrong screen. Known harness gotcha: a by-name invocation can hand the script its args as a JSON-encoded string; the script parses defensively, but keep the object shape anyway.
- Quality gates inside the workflow: seats read the real source files and their full rubric skill files; after the independent reviews comes one rebuttal round between seats; every P0/P1 finding is adversarially verified against the code and screenshots before it may enter the punch list; surface coverage is checked and gaps get targeted follow-up reviews; and each direction preview is judged (register fit, distinctiveness against the mandate, feasibility, mutual distinctness), with a failing preview rebuilt once on the judge's notes.
- Parallelism lives inside phases (seat reviews, verifications, preview builds, and judging run in parallel); the phases themselves stay in order. Parallel agents are part of the workflow, never a replacement for it.
- When the full board returns, before presenting the report, check that the brief's resolved target matches what the user requested. If it names a different surface, say so plainly and do not present the review as valid.
- Never skip the brief, the visual capture, the synthesis, the directions, or the handoff. If something blocks a phase (for example the app will not run), degrade that phase explicitly and say so at the top of the report, but still run the full sequence.
- The workflow stops at the report and never triggers facelift on its own (a background run cannot ask the user, and the handoff must stay explicit). When it returns, the main loop runs Step 6: present the punch list, the directions, and the preview paths, state the next step out loud using the returned handoff message, and ask whether to proceed. Only on the user's go do you invoke facelift on the chosen direction.

## Step 0 - Seat availability

Confirm which installed skills back the three craft seats: `impeccable`, `design-taste-frontend`, `emil-design-eng`. If one is missing, name it, give its install command, and proceed with the rest (degrade gracefully, never abort). The Product and Content seats are built into this skill and are always available.

- impeccable: `npx skills add pbakaus/impeccable --global`
- design-taste-frontend: `npx skills add https://github.com/Leonxlnx/taste-skill --skill "design-taste-frontend" --global`
- emil-design-eng: `npx skills add emilkowalski/skill --global`

## Step 1 - Detect the brief (no questions yet)

Read the repo and state it back in 3 to 5 lines. This brief is handed to every seat verbatim.

- **Stack:** framework, styling, component library, animation library, icons, data layer. Read `package.json` and config files. Fixes must be expressed in these real tools.
- **Register:** product/utility (apps, dashboards, tools, settings; design serves usability) versus brand/marketing (landing pages, campaigns, portfolios; design is the message). Decide per target surface. A product like a real estate app and its marketing site get different registers even in one repo.
- **Domain:** what the app is about (finance, home automation, real estate, etc.). Read the README, routes, and visible copy. The domain grounds the Product seat.

## Step 2 - Resolve the target and capture visuals

Resolve the argument to a concrete screen, route, component, or URL. With no argument, inventory the routes and ask which to review, or offer "the whole app." Target resolution and any asking happen in the main loop, BEFORE any workflow launch; the workflow verifies the target it receives and refuses to guess, but it never chooses one. With the saved workflow, launch 1 does the repo-side resolution and returns it; confirm it against what the user asked before going further. A target may span several surfaces (for example a settings card plus two runner CLIs); every named surface is part of the target.

Then get visuals before any seat speaks. Capture them IN THE MAIN LOOP, never from a background workflow agent: background agents hang waiting on an access approval that can never arrive (this once froze a run for about 25 minutes). With the saved workflow, capture between launch 1 and launch 2 and pass the absolute paths in `screenshotPaths` plus a line or two of `visualNotes`.

- Start the dev server and capture screenshots at desktop width, mobile width, and dark mode (resize for each). Use the preview tools. Playwright is available in some repos as a fallback.
- Operate the live UI for UX and feel: walk the primary task end to end, trigger the loading, empty, and error states, check hover, focus, and pressed states, and watch the motion (slow it down to inspect easing and timing). Put what you felt into `visualNotes`.
- If the app cannot run (missing env, broken build), fall back to reading code only, and say so at the top of the report. Flag that visual and feel findings are limited in that mode.

## Step 2.5 - Pull precedent (Mobbin) IN THE MAIN LOOP, so the user sees it

Before the seats speak, gather real-world precedent so critiques cite evidence, not just taste. Pull it in the MAIN LOOP, not inside the background workflow. The Mobbin tools return inline images and render an interactive gallery, but only in the main loop; a background agent only gets text back, so the user never sees the mood board. This is the same rule as screenshots: do the visual work where it renders, then pass the result into the workflow. This step is read-only and skips cleanly when Mobbin is unavailable.

- Between stage 1 and stage 2, detect the Mobbin MCP tools (`mcp__mobbin__search_screens` and `mcp__mobbin__search_flows`). If they are absent or need authentication, skip and note "no Mobbin precedent available"; never block the review.
- Query with the detected domain plus the target's screen or flow type and platform: `search_screens` for single screens (for example "real estate property listing", platform ios), `search_flows` for multi-step journeys (for example "checkout flow", platform web). Pull roughly 3 to 6 strong current examples. The inline images and gallery render right here, so the user can SEE the candidate mood board, and you cite each screen as a markdown link to its `mobbin_url`.
- Pass the structured set into stage 2 as the `precedent` arg: `{ available: true, references: [{ app, pattern, mobbinUrl }] }`. The workflow uses it as-is and skips its own text-only Mobbin call. If you do not pass precedent, the board still runs but pulls text-only references in the background with no visible gallery.
- The set is reference for how the job is really done and where the bar sits, never a template to copy. It is also the anti-AI-tell evidence base: name the real shipped apps the design echoes or falls short of.

## Step 3 - Convene the seats

Each seat returns a short verdict in its own voice, then a findings table: each row is a finding, a severity (P0 blocking, P1 major, P2 minor, P3 polish), and one or two concrete fixes. No seat edits code. Each craft seat reads its full backing skill file as its rubric, not a one-line summary of it, and every seat reads the actual source files from the brief. Every finding is tagged with the surface it sits on and cites its evidence (the file or screenshot that shows it); a surface with no findings is explicitly marked clean, never silently skipped. Keep seats isolated from each other for this first round; one structured rebuttal round follows (each seat reacts once to the others' findings: endorse, contest, or amend, with reasons) before anything reaches the Chair.

1. **Art Director** (design-taste-frontend). Fights for distinctiveness and against looking AI-generated; owns color and type taste. Weight by register: a strong voice for brand surfaces; for product surfaces narrow its vote to the "does this look templated" gut check plus color and type, and ignore its landing-page layout rules. When a Mobbin precedent set was pulled in Step 2.5, use it as the yardstick for the templated-versus-distinctive call: name the real apps the design echoes or falls short of.
2. **Systems Lead** (impeccable). Fights for a coherent, correct, accessible system: tokens, hierarchy, information architecture, responsive behavior, anti-patterns. Brings the scorecard: Nielsen's 10 heuristics scored 0 to 4, the cognitive-load checklist, and 2 to 3 relevant personas. The anchor and the quality gate. For the full treatment, run `impeccable critique` on the target directly and fold its result in as this seat.
3. **Design Engineer** (emil-design-eng). Fights for feel: the eight interactive states, motion restraint, custom easing and durations, perceived performance, and the invisible details. Reviews motion with a Before / After / Why table. Argues against animating high-frequency or keyboard-initiated actions.
4. **Product / Jobs-to-be-done** (built in). Fights for the user's real job in the detected domain, not feature completeness. Apply this rubric:
   - State the primary job of this screen in one sentence.
   - Count the steps to complete it; flag anything that adds a step without adding value.
   - Is the primary action the most prominent element on the screen? If not, that is at least P1.
   - Does the screen show exactly the information needed for the decision made here, and nothing that belongs on another screen?
   - Are the empty, loading, and error states designed for the core task, not just the happy path?
   - Does the structure match the user's mental model of the domain, not the database schema?
   - When Mobbin precedent is available, compare this screen to how leading apps in the domain structure the same job, and flag where it diverges without a good reason.
5. **Content / UX writing** (built in). Fights for plain, consistent language. Apply this rubric:
   - Every button label is verb plus object and says what will happen ("Save changes," not "OK").
   - Labels and terms are consistent across the screen and use the domain's real words.
   - Error messages name the problem and the fix, in plain language, near the field.
   - Empty states say what the thing is and how to fill it.
   - Numbers, dates, and currency are formatted for the locale; bilingual apps stay consistent across Spanish and English.
   - No jargon, no em dashes.

## Step 4 - The Chair synthesizes

Do not concatenate the seats. Weave them into one report:

- **Brief recap:** stack, register, domain, target, and visual mode (live or code-only).
- **Verification:** every P0 and P1 finding is adversarially verified against the actual files and screenshots before it may enter the punch list; a verifier tries to refute it, and refuted findings are dropped or downgraded and reported as such. The punch list carries only findings that survived.
- **Coverage:** every surface named in the brief is reviewed or explicitly marked clean; uncovered surfaces get targeted follow-up reviews, and the report states per-surface coverage so silence is never read as "covered".
- **Agreements:** what two or more seats independently flagged, citing the endorsements from the rebuttal round. These are the high-confidence priorities.
- **Conflicts:** where seats disagree, citing the actual contestations from the rebuttal round. Name who wants what (for example, Art Director wants bolder, Systems Lead wants quieter), then give a recommended tie-break. Tie-break rule: keyed off register. Product leans to clarity and trust; brand can lean to expressiveness. A priority the user has stated overrides the rule.
- **Precedent:** if a Mobbin reference set was pulled, a short note on what comparable current apps do and where this screen sits against that bar; tie specific punch-list items to the precedent that supports them.
- **Prioritized punch list:** one ordered list across all seats, each item tagged P0 to P3, with the concrete fix and which seat raised it. Each item is also tagged with its executor: "reskin" (purely presentational, no behavior change, so facelift can implement it) or "behavior" (changes logic, flow steps, what data is shown, validation, a new surface, or a correctness bug, which facelift is forbidden to touch). Be conservative: when in doubt, tag it behavior.
- Be direct and specific. Name the exact element. Prioritize ruthlessly; if everything is important, nothing is.

## Step 5 - Directions, each one previewed

The board's result is two things: the prioritized punch list (the problems) and a small set of UI directions the user can actually see (where it could go). Produce 2 to 3 distinct directions, never one, each a coherent take on the screen (for example "quiet and editorial," "bold and warm," "dense and utilitarian"). Present them after the punch list and before the closing question.

For each direction:

- **Name and intent:** a short name and one line on the mood it commits to.
- **Mood board (when Mobbin is available):** 3 to 5 references that exemplify it, each with the app name and the one quality it shows. Make it VISIBLE: when you present each direction in the main loop, render its mood board by citing each reference as a markdown link to its `mobbin_url`, and re-run the Mobbin search for that direction's references so the inline gallery renders for the user, the same way it rendered in Step 2.5. The set the workflow returns carries the `mobbinUrl` for each reference so you can do this without re-deriving it. When Mobbin is off, say so and rely on the written moves and the preview.
- **Rendered preview:** a self-contained HTML file at style-tile-plus-hero fidelity, so the user can open it and feel the direction. It contains the palette, type specimens, the key UI atoms (buttons, inputs, cards), and ONE representative section rebuilt from the user's real content (real headings and copy, not lorem). Embed the CSS and load fonts from a CDN so the single file renders on its own, the way the user's attached sample does.
- **Moves:** 2 to 3 concrete changes this direction would make on the real screen, each tied to a punch-list item.

Every built preview passes a judge gate before it reaches the user: judges score register and domain fit, distinctiveness (does it read as AI-built or templated; does it honor the mandate), feasibility in the real stack, and mutual distinctness across the directions (three names on one style is a fail). A failing preview is rebuilt exactly once with the judge's notes, then re-judged. The Chair recommendation cites the judge scores.

Close with a short Chair recommendation: which direction best fits the register and domain, and why, without deciding for the user.

Where previews go (read-only and disposable):

- Write one HTML file per direction to a scratch folder OUTSIDE the user's project, for example a `ui-board-previews` directory under a temp or home location, never inside the repo. Give the folder or filenames a per-project slug so previews from different apps do not overwrite each other. Print the full path to each file so the user can open it in a browser.
- Never edit the user's screens, never add preview files inside their app, and never commit anything. The previews exist only to help the user choose; facelift implements the chosen one for real.

## Step 6 - Stop, name the next step, then ask whether to act

The board only advises and stops here. It does not implement anything, and it never rolls straight into a redesign in the same turn. After presenting the report, do not start the redesign or modify the user's app on your own. The only artifacts the board creates are the standalone previews from Step 5.

State the next step in plain words before you ask, and route by executor. The punch list is split into a reskin track and a behavior track (see the routing in the returned handoff). Say it explicitly, for example: "The board is review only and has changed nothing. The reskin items go to the `facelift` skill, which implements the chosen direction screen by screen on a branch with behavior preserved. The behavior-change items cannot go to facelift (its gate blocks behavior change); they go to a build path, `write-spec` to formalize each one, then the `forge` build skill to implement it test-gated." Then ask the closing question over both tracks.

Never send behavior-tagged items to facelift. If the chosen direction itself depends on behavior changes (new surfaces, restructured flows), those parts belong to the build path too; facelift implements only the presentational layer.

Use AskUserQuestion (or ask in chat if that tool is unavailable), with options along these lines:

- Yes, the reskin track. The user names which of the 2 to 3 directions to implement; that direction plus the reskin items go to `facelift`.
- Yes, the behavior track. The behavior-change items go to `write-spec`, then the `forge` build skill.
- Yes, but only the P0 and P1 items, in the chosen direction. Scopes facelift to the blocking and major findings.
- Only specific items I will name, in the chosen direction. Let the user choose which findings to carry over.
- No, not now. Stop here; the report and previews stay as the deliverable.

The chosen direction (its preview, references, and moves) travels with the punch list into facelift as the starting direction.

Only after the user answers, and only if they choose to proceed, do you invoke `facelift` (or, for one narrow fix, the matching `impeccable` command such as polish, layout, clarify, colorize, or typeset, or `emil-design-eng` for motion). Triggering facelift is always a separate, later turn that the user sets off; the board never calls it automatically. Until the user explicitly says go, change nothing, write nothing, and start no skill.

## Rules

- Advice only. The board never edits the user's code or screens, and never starts a redesign or runs facelift by itself. Its only artifacts are the report and the standalone direction previews from Step 5. Running the app and clicking through it to observe is fine; changing it is not.
- The transition to facelift is always explicit. The board names triggering facelift as the literal next step, then stops and waits for the user. It never treats its own advice as permission to begin, and it never invokes facelift in the same turn as the review.
- Read-only with respect to the user's project. Never edit the user's code, screens, or repository. The board may write standalone, disposable preview files to a scratch folder outside the project to help the user visualize directions; it never modifies or adds files inside the user's app, and never commits.
- Pulling Mobbin references is allowed: it retrieves inspiration and changes nothing, so it stays advisory like the rest of the board.
- A user mandate is binding. When the user has standing design constraints, pass them in the workflow's `mandate` arg (and apply them inline when running without the workflow); they constrain the Art Director, the directions, the previews, and the judges. For Andres's Lovable apps the standing mandate is: the burned recipe is banned (warm paper, serif display, monospace numerals, one earthy accent); design content-first, jobs-first, not kit-first; pull precedent from specific named shipped apps, not vibe boards. The goal is "does not read as AI-built"; uniqueness is the symptom, not the target.
- No em dashes anywhere. Use periods, commas, parentheses, semicolons, colons.
- The report and the previewed directions are the deliverable; present the report in full in chat and link each direction's preview file by its full path.
- Domain-agnostic and global. The only things that change per project are the detected brief; the seats and the process stay identical.
