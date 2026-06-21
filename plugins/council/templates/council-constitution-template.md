# [PROJECT_NAME] Constitution

> The durable principles this project's build must obey. The Council reads this at every stage (business-council, forge, facelift) and its gates (forge-analyze, forge-verify, facelift-verify) enforce it: a violation of a MUST principle is a blocker, a violation of a SHOULD is a warning. This is the structured, committed form of the per-run `mandate`. Keep it short; principles, not prose.
>
> Convention: live at `.council/constitution.md` in the repo (committed, durable). Pass its content to the Council workflows as the `constitution` arg, or fold it into `mandate`. Update it deliberately; bump the version and date below.

## Principles

Each principle has a name, a MUST or SHOULD rule, and a one-line rationale. Prefer MUST/SHOULD over vague words like "should consider".

### I. [PRINCIPLE_NAME]
[MUST | SHOULD] [the rule, stated so a gate can check it]. Rationale: [why].

### II. [PRINCIPLE_NAME]
[MUST | SHOULD] [the rule]. Rationale: [why].

### III. [PRINCIPLE_NAME]
[MUST | SHOULD] [the rule]. Rationale: [why].

<!--
Example principles (delete or adapt):
### I. Behavior preserved unless specced
MUST not change behavior outside the slice's acceptance criteria. Rationale: keeps each change reviewable and reversible.
### II. Money math reconciles
MUST keep every stored money value reconciling to its source and surviving a reload. Rationale: a finance tool that loses a number loses trust.
### III. Secrets never leave the vault
MUST keep credentials in the OS secret store, never in code, logs, or plain storage. Rationale: a credential leak is unrecoverable.
-->

## Stack and Environment

- Framework, language, data layer, deploy target: [fill]
- Locale and language: [e.g. es-AR UI, English code identifiers]
- Platform constraints: [e.g. Lovable-managed remote is the source of truth; Supabase schema changes run via the dashboard with idempotent SQL, never migrated from the repo]

## Security Posture

- Is this project security-sensitive (credentials, financial data, secrets)? [yes/no]
- If yes: [the non-negotiables, e.g. secret store over IPC, encryption at rest, no secrets in logs]

## Design Mandate

- The binding anti-AI-tell rules and banned styles: [e.g. the burned recipe (warm paper, serif display, monospace numerals, one earthy accent) is banned; content-first; precedent from named shipped apps]
- House rules: [e.g. no em dashes anywhere; verb-plus-object button labels]

## Governance

This constitution supersedes ad-hoc preferences for this project. Amend it deliberately: state what changed and why, then bump the version and date. The Council gates check against the version current at run time.

- Version: [0.1.0]
- Ratified: [YYYY-MM-DD]
- Last amended: [YYYY-MM-DD]
