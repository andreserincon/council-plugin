---
name: business-council
description: Advisory business board ("the council") that convenes five committed perspectives on ANY venture or product idea (product architecture, the operator/customer voice, domain correctness, market strategy, and solo-builder feasibility), grounds them in cited and verified web research plus prior-art repos, then synthesizes one prioritized business-and-functional requirements report and 2 to 3 judged product directions, each with a one-page HTML concept sheet. Domain-agnostic: it adapts to a finance app, a consumer app, a developer tool, an automation tool, or anything else from the brief. Use when the user wants a multi-perspective business review of an app idea, venture, business model, or "business council/board" opinion, or invokes /business-council. Advisory only: it never writes code, never edits repos, and stops before any PRD or build.
---

# Business Council

The business sibling of the UI board: a read-only advisory council that turns a venture description into verified requirements and a small set of judged product directions the user can choose between. It is advisory only; acting on the advice (a PRD via `write-spec`, then building via `forge`) is a separate step the user explicitly opts into at the end.

Domain-agnostic, like the UI board. The council works for any kind of app or venture; it reads the domain from the brief and adapts. The first venture it was built for was a finance app, so the finance lens is well developed, but nothing assumes finance: the seats reason from whatever domain the brief states, and the small-business jobs catalog is used only when the venture actually serves business owners.

## What makes the council work

- **Independent committed seats.** Five perspectives review the same brief without seeing each other first, then debate once: Product Architect (spec discipline, ruthless scope), Operator (the target user's daily workflow, whoever that user is), Domain Correctness (the core domain logic the app must get right, whatever the domain: accounting for a money app, conflict rules for scheduling, integrity for a data app, reliability for an automation app), Market Strategist (competitive wedge and pricing), Builder Risk (solo-builder feasibility, data-access reality, security).
- **Evidence or it does not count.** Market claims need cited sources; load-bearing research facts are adversarially source-checked before anything is built on them; every P0/P1 requirement must survive an attempt to refute it (grounding and feasibility) before it reaches the report.
- **Coverage guaranteed.** The brief derives 8 to 12 coverage areas for the specific venture; every area ends reviewed or explicitly marked clean, and gaps get targeted follow-ups.
- **Judged directions.** 2 to 3 genuinely distinct product shapes, each a one-page HTML concept sheet scored on job fit, viability, buildability, and differentiation, with one rebuild on the judge's notes and a cross-set distinctness check.

## How it runs

A saved workflow named `business-council` ships alongside this skill (in the user `.claude/workflows` folder); run it by name in TWO launches.

- **Launch 1 (brief only):** resolves the venture into a structured brief (target user, problem, jobs, coverage areas, prior-art inventory, open questions) for one agent's cost and returns. Present the brief to the user, get the open questions answered, collect any extra materials (past attempts, notes), and confirm before anything expensive runs. The workflow throws when the venture description is too thin; that is deliberate, it asks instead of padding with guesses.
- **Launch 2 (full council):** relaunch with `confirmedBrief`. Research (web, cited, fact-checked), seats, rebuttal, verification, coverage, synthesis, directions, concept sheets, judge gate, critique.

The args contract: pass `args` as a JSON object, never a JSON-encoded string (the harness can hand the script its args stringified; it parses defensively). Launch 1 takes a required `venture` (the idea in the user's words, enriched with anything already known) plus optional `priorArt` (absolute repo paths worth mining, for example a sibling app that already solves part of the problem), `materials` (notes or past-attempt files), `mandate` (binding constraints: builder, stack, locale, budget), `directions`, `scratchDir` (per-venture folder outside any repo), and `webResearch` (default true). Launch 2 repeats those plus `confirmedBrief` exactly as stage 1 returned it, with open-question answers folded in, and accepts two throttle controls: `maxConcurrency` (default 4) and `maxFactChecks` (default 12).

## Run one council at a time, and keep the burst small

The full council fans out (research, fact-checks, five seats, verification, build, judge). The Workflow runtime caps each workflow at 16 concurrent agents, so two councils overlapping reach about 32 large-context requests at once, which trips a server-side throttle ("Server is temporarily limiting requests (not your usage limit)") and can collapse a whole run. Two rules keep it healthy:

- **Never run two councils (or a council plus another heavy workflow) at the same time.** Launch the full council ONCE per turn. If a run looks stuck, stop it (TaskStop on its task id) and confirm it is gone before relaunching; do not blind-rerun, which is what doubled the load and caused the failure on 2026-06-12. The two-launch pattern means exactly one stage-1 then one stage-2, never a second stage-2 on top of a live one.
- **The workflow already throttles itself:** it bounds its own in-flight width to `maxConcurrency` (default 4) regardless of the runtime cap, caps fact-checks at `maxFactChecks`, and fails fast and cheap with a clear remedy if a rate-limit storm wipes out the research or seat stage (rather than grinding for half an hour). If you still hit throttling, relaunch with `maxConcurrency` set to 2 or 3. Raise it only when you are certain nothing else heavy is running.

## Leveraging the installed skill packs

The council leans on the Small Business and Product Management packs three ways, all conditional on relevance so a non-business venture is never forced through a small-business lens:

- **As a jobs checklist inside the council, when the venture serves business owners.** The Small Business catalog (business-pulse, cash-flow-snapshot, month-end-prep and close-month, margin-analyzer and price-check, invoice-chase, plan-payroll, sales-brief, customer-pulse, tax-season-organizer, the recurring briefs, lead-triage) is embedded in the workflow and handed to the Brief agent and the Operator, Domain Correctness, and Market Strategist seats. When the target user is a business owner or operator, each entry is a candidate job the product might do, so the brief derives coverage areas from it and the seats decide per job: must the app do it, defer it, or not do it. When the venture is in another domain, the seats treat the catalog as one reference lens and reason from the brief instead.
- **As named seat methods, when they fit.** Product Architect runs on write-spec, product-brainstorming, and roadmap-update discipline (domain-neutral, always useful); Operator on business-pulse, the smb-onboard owner interview, and customer-pulse; Domain Correctness on the finance skills (cash-flow-snapshot, margin-analyzer, month-end-prep, close-month, invoice-chase, tax-season-organizer) ONLY when the venture handles money, otherwise it applies its own domain's correctness directly; Market Strategist on competitive-brief, content-strategy, and price-check. Seat agents invoke these skills when their environment exposes them and the venture fits, and fall back to the distilled charges otherwise, so the council still runs when a pack is unreachable or irrelevant.
- **As the pipeline around the council.** Between launch 1 and launch 2, optionally run `brainstorm` or `product-brainstorming` to sharpen the venture and `competitive-brief` to seed the competitor landscape in the main session, and pass their outputs in `materials` so the council researches on top of them instead of from zero. After the council, the chosen direction goes to `write-spec` for the PRD, then `roadmap-update` and `sprint-planning` turn the PRD into a build plan. Once the product exists with real data, the Small Business skills become the benchmark it must beat.

## Rules

- Advisory only. The council never writes code, never edits a repo, never builds. Its only artifacts are the report and the standalone concept sheets in the scratch folder.
- The handoff is explicit. The council names the next step (a PRD on the chosen direction via the `write-spec` skill, and only after that any building) and then stops and waits. It never invokes the next step itself.
- The skill packs integrate as described in "Leveraging the installed skill packs"; the seats carry distilled charges as the fallback so the council still runs when a pack is unavailable to background agents.
- A user mandate is binding for every seat that shapes the product (Product Architect, Market Strategist, Builder Risk), the directions, the sheets, and the judges.
- Background agents never browse interactively or start servers; research agents use web search with citations and read local repos and files.
- When the council returns, verify the report's resolved venture matches what the user asked before presenting; if it drifted, say so plainly instead of presenting it as valid.
- No em dashes anywhere, including the concept sheets. Present the report in full in chat and link each direction's sheet by its full path.
