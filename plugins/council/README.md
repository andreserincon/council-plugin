# The Council (plugin)

An end-to-end product pipeline of committed-perspective boards and gated builders. Each stage is run by seats that debate and adversarially verify before anything ships. Domain-agnostic: it works on a finance app, a consumer app, a developer tool, an automation tool, or anything else, reading the domain from the brief.

## The pipeline

- **/council** (command): the front door and router. Type `/council` (optionally with your request after it). It diagnoses what you need and routes to the right board or builder, naming the downstream path. It does not run the chain unattended; each stage still stops for you.
- **ui-board** (skill + workflow): read-only design review. Five seats convene on a screen, debate, adversarially verify findings, and return a prioritized punch list plus 2 to 3 judged UI directions with previews and Mobbin mood boards. Each punch item is tagged reskin or behavior so the handoff routes correctly.
- **business-council** (skill + workflow): read-only venture and requirements review. Five seats (product, the operator, domain correctness, market, builder risk) grounded in cited and verified web research, returning a prioritized requirements report and 2 to 3 judged product directions.
- **forge** (skill) + **forge-analyze** and **forge-verify** (workflows): the test-gated builder for NEW behavior, greenfield or behavior-change. Builds slice by slice, risk first. forge-analyze is the cheap pre-build consistency gate; forge-verify is the per-slice gate (spec conformance, correctness, security, data integrity, design fidelity, regression, tests).
- **facelift** (skill) + **facelift-verify** (workflow): the behavior-preserving reskin builder for existing screens, gated on behavior preservation.

Flow: ui-board or business-council decides, write-spec formalizes, forge builds (or facelift reskins), then ui-board and facelift polish. Behavior changes never go to facelift; they go to write-spec then forge.

## Prerequisites

The Council degrades gracefully when these are missing, but it is at full strength with them:

- **Design craft skills** (used by ui-board, forge, and facelift for any UI work). Install globally:
  - `npx skills add pbakaus/impeccable --global`
  - `npx skills add https://github.com/Leonxlnx/taste-skill --skill "design-taste-frontend" --global`
  - `npx skills add emilkowalski/skill --global`
- **Plugin packs** (business-council leans on these when the venture serves business owners): the Anthropic Small Business and Product Management plugins. Optional; seats fall back to their built-in method without them.
- **Mobbin MCP** (ui-board precedent and visible mood boards). Optional; the board notes "no precedent" and still runs.

## How the workflows are provided

The Council skills invoke their workflows by name via the Workflow tool, which resolves names from `~/.claude/workflows`. A plugin has no auto-discovery slot for saved workflows, so a SessionStart hook (`hooks/sync-workflows.mjs`) seeds the bundled workflows into `~/.claude/workflows` on a machine where they are missing.

The seed is copy-if-missing only: it never overwrites an existing file, so it is a harmless no-op on a machine where those workflows are already the canonical, hand-edited source, and it cannot revert local edits. It is non-fatal: in a read-only or headless environment it logs and exits cleanly.

## Source of truth and re-syncing

These plugin files are a portable copy. If the canonical `~/.claude` skills and workflows are edited later, re-export them into this plugin to keep the copy current (copy `~/.claude/skills/{ui-board,business-council,facelift,forge}/SKILL.md`, `~/.claude/workflows/{ui-board,business-council,facelift-verify,forge-verify,forge-analyze}.js`, and `~/.claude/templates/council-constitution-template.md` into the matching plugin folders), then bump the version in `.claude-plugin/plugin.json`.

## Constitution

The constitution template lives at `templates/council-constitution-template.md` and is seeded to `~/.claude/templates`. Author one per project at `.council/constitution.md`; forge and facelift read it and their gates enforce it (a MUST violation is a blocker).
