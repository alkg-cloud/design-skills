# design-feature scripts

In-skill scripts invoked by `design-feature/SKILL.md` and `bootstrap-design-system/SKILL.md`. Ship as part of the skill — no `npm install`, no external runtime dependencies beyond what the host OS already provides.

## OS resolution

Every operation has a `.sh` (Unix bash) and a `.ps1` (Windows PowerShell) variant. The skill prose dispatches to the right one based on the host OS:

| Host                | Invocation                                  |
|---------------------|---------------------------------------------|
| Linux, macOS, WSL   | `./scripts/<op>.sh [args]`                  |
| Windows (native)    | `pwsh ./scripts/<op>.ps1 [args]`            |

(WSL counts as Linux — `.sh` runs there.) The agent reading the SKILL.md detects the OS from the harness's environment metadata; no auto-detect wrapper script ships with the pair.

## Env vars

| Var            | Required | Meaning                                                          |
|----------------|----------|------------------------------------------------------------------|
| `MARKUP_URL`   | yes      | Base URL of the Markup server, no trailing slash. `https://markup.example.com`. |
| `MARKUP_TOKEN` | yes      | Bearer token. Sent as `Authorization: Bearer $MARKUP_TOKEN` on every request. |
| `DESIGN_SKILLS_DEPS_DIR`      | no  | `ensure-deps` cache root. Default `~/.markup-design/deps`. |
| `DESIGN_SKILLS_DEPS_TTL_DAYS` | no  | `ensure-deps` refresh threshold in days. Default `30`. |
| `SUPERPOWERS_REPO`            | no  | `ensure-deps` git source for superpowers. Default `https://github.com/obra/superpowers`. |
| `SUPERPOWERS_REF`             | no  | `ensure-deps` branch. Default `main`. |
| `FRONTEND_DESIGN_URL`         | no  | `ensure-deps` raw URL of frontend-design's `SKILL.md`. Default the anthropics/claude-code `main` raw URL. |

If either is unset, the scripts exit non-zero with a clear error before making any network call. The skill's pre-Phase-0 doctor step is the first place this is checked.

## Exit codes

| Code | Meaning                                                   |
|------|-----------------------------------------------------------|
| 0    | Success.                                                  |
| 1    | Generic failure (network error, bad response, etc.).      |
| 2    | Missing env var (`MARKUP_URL` or `MARKUP_TOKEN`).         |
| 3    | Structural lint failure (`lint-ds` only) — file invalid.  |
| 4    | Bad arguments (wrong number, file not found).             |

`ensure-deps` uses exit `0` for "all requested deps usable (fresh/refreshed/stale)", `1` for "a requested dep had no cache and the fetch failed", and `4` for bad arguments.

On any non-zero exit, the script writes a human-readable error to stderr. Successful runs print structured output to stdout (JSON for `doctor`, `mockup-upload`, `sync-index`, `comment list/read`; a one-line OK message for `promote`, `sync-index`, `lint-ds`).

## Op index

| Script           | Purpose                                                          |
|------------------|------------------------------------------------------------------|
| `doctor`         | GET /api/version + reachability probe. Replaces `markup-cli doctor --json`. |
| `mockup-upload`  | POST a mockup HTML file (new mockup or new version of existing). Replaces `markup-cli mockup new/version`. |
| `promote`        | Copy a mockup to `docs/design/design-system/NN-<slug>.html`, enforce the `data-ds-component` marker, POST to /api/ds/components. Replaces `markup-cli promote`. |
| `sync-index`     | POST /api/ds/sync-index. Replaces `markup-cli sync-index`.       |
| `lint-ds`        | Structural lint of a DS file (§1 grid, §4 Code API, §7 tokens, §8 Behavior — all non-empty). Pure local. Replaces `markup-cli check --build --strict`. |
| `comment`        | Subcommand dispatcher (`list`, `read`, `reply`, `react`, `resolve`) for the comments REST endpoints. Optional — inline curl in skill prose works too. |
| `ensure-deps`    | Fetch missing composed sub-skills (superpowers via shallow git clone of `main`; frontend-design via curl) into `~/.markup-design/deps`, honoring a 30-day TTL. Prints a manifest JSON. New in design-feature dependency-resolution. |
