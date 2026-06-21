# Council marketplace

A one-plugin Claude Code marketplace for **The Council**: an end-to-end product pipeline of committed-perspective review boards and gated builders that decide, spec, build, and polish any app.

The plugin itself, with its skills, workflows, gates, and full documentation, lives in [`plugins/council`](plugins/council/README.md).

## Install

In Claude Code, add this marketplace and install the plugin (use the `/plugin` command):

1. Add the marketplace, pointing at this folder locally, or at the git URL once you push it:
   - Local: add the marketplace from the path to this repository.
   - Remote: push this repository to GitHub, then add the marketplace from the GitHub URL. This is what makes the Council available on other machines and in cloud or headless sessions.
2. Install the `council` plugin from the `council` marketplace.
3. Start a new session. The SessionStart hook seeds the workflows into `~/.claude/workflows` if they are not already there. The skills (`ui-board`, `business-council`, `forge`, `facelift`) become available as slash commands and by natural request.

## What you get

- `ui-board`: multi-perspective design review of a screen.
- `business-council`: venture and requirements review for any app idea.
- `forge` (with `forge-analyze` and `forge-verify`): test-gated builder for new behavior.
- `facelift` (with `facelift-verify`): behavior-preserving reskin of existing screens.

See [`plugins/council/README.md`](plugins/council/README.md) for the pipeline, prerequisites (the design craft skills, the plugin packs, the Mobbin MCP), and how the workflows are provided.

## Portability notes

The Council is domain-agnostic and works on any app. Its full strength depends on a few external pieces that are connected per environment (the design craft skills, the Small Business and Product Management plugin packs, and the Mobbin MCP); without them it degrades gracefully. The bundled workflows are portable: they reference the design skills by name, not by machine-specific file paths.
