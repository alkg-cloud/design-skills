# Schema changelog

Tracks changes to the persisted JSON schemas of `design-feature` and `bootstrap-design-system`:

- `strategy.json` (repo-wide, at `.markup-design/scratch/strategy.json`)
- `state.json` (per-feature, at `.markup-design/scratch/<slug>/state.json` for design-feature; per-bootstrap at `.markup-design/bootstrap/state.json`)
- `registry.json` (per-user, at `~/.markup-design/registry.json`)

## Compat policy

- Each file carries a top-level `schemaVersion` integer.
- **Bump** `schemaVersion` only on **breaking** changes: field rename, removal, or semantic shift of an existing field.
- **Do not bump** for additive changes (new optional field). Document them here under "Additive — no bump".
- Skill reads treat **missing** `schemaVersion` as `0` and migrate inline with safe defaults (see field-level docs in each SKILL.md).

## Version 3 (2026-06-09) — feat/runtime-skill-deps

**Additive on `state.json` — schemaVersion 1 → 2.** Added a top-level `deps` object: a map of composed sub-skill name (e.g. `"superpowers"`, `"frontend-design"`) → `{ mode, path, stale }`, recording how each sub-skill was resolved at skill start:

- `mode`: `"installed"` (found via harness plugin registry) or `"fetched"` (downloaded into `~/.markup-design/deps` by `ensure-deps`).
- `path`: absolute path to the resolved skill file.
- `stale`: boolean — `true` if the cached copy is older than the TTL but was used because a re-fetch failed.

Migration: reads of a v1 `state.json` (no `deps` field) must resolve `deps` fresh at skill start via the skill's § "Dependency resolution" section. No destructive migration needed — the field is simply populated on the next run.

## Version 2 (2026-05-24) — Sub-plan 10

**Breaking — frontmatter contract.** The `compat.cli` field is removed from both SKILL.md files. Skills no longer depend on the `markup-cli` npm package; deterministic operations move to in-skill scripts at `skills/design-feature/scripts/{doctor,mockup-upload,promote,sync-index,lint-ds,comment}.{sh,ps1}` (referenced via `../design-feature/scripts/` from bootstrap-design-system). Auth + server location move to env vars: `MARKUP_URL` and `MARKUP_TOKEN`.

Migration for downstream consumers: there is no consumer-side schema migration. The change is fully internal to the skills; existing `strategy.json` / `state.json` / `registry.json` files on disk remain compatible. Any external automation that parsed a SKILL.md `compat.cli` field stops finding it; the field is simply absent.

Validator changes (`validate.mjs`): `KNOWN_CLI_COMMANDS` and the markup-cli reference check are deleted; `validateScriptInvocations` and `validateScriptParity` are added; the `compat.cli` requirement in the per-skill frontmatter check is removed; the `compat.cli` alignment check in `validateCompatAlignment` is removed.

## Version 1 (2026-05-23) — Sub-plan 6

Initial versioning. Establishes `schemaVersion: 1` baseline for all three files. Pre-SP6 files (no `schemaVersion`) are treated as version `0` and migrated inline:

- `strategy.json`: `bootstrappedFromEmpty` defaults to `false` when absent; `branchCheck` may be `undefined` for files written before SP5 — Phase 3 gate degrades to "branch check skipped, original branch unknown".
- `state.json` (design-feature): `chromeMcp` absent ⇒ resolve via §"Chrome MCP tool resolution"; `qaRun` absent ⇒ `null`.
- `state.json` (bootstrap): no field migration needed (no additive fields pre-SP6).
- `registry.json`: did not exist pre-SP6; treated as empty (`{ "schemaVersion": 1, "repos": {} }`) on first read.

## Additive — no bump

_(none yet — log future additive changes here with date + sub-plan reference)_
