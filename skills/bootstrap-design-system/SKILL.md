---
name: bootstrap-design-system
description: "One-shot bootstrap that extracts a Design System from an existing app's running UI, so the design-feature workflow can be adopted on a project that already has code. Uses Chrome MCP to snapshot rendered components, then ports JSX/Vue/Svelte behavior to vanilla JS micro-apps. Manage expectations: this is a draft generator, not a finished DS — every item needs human curation."
compat:
  markup: ">=0.2.0"
---

# Bootstrap Design System

> **Convenção de idioma:** strings printadas/prompted ao usuário → PT-BR. Instruções ao agente → English.

This skill is a **one-shot bootstrap** that produces a draft Design System from an existing application's running UI. Run it once per project, before the first use of the `design-feature` skill.

## Cross-harness tool reference

This skill uses Claude Code tool names (`Read`, `Write`, `Edit`, `Bash`, `Skill`, `mcp__<server>__<tool>`). For the explicit equivalents on **Gemini CLI** and **Codex CLI** — including how to install Chrome MCP on each harness, how each harness invokes a sub-skill, and the agent-guidelines-file lookup priority (`AGENTS.md` → `CLAUDE.md` → `GEMINI.md`) — see § "Cross-harness tool reference" at the top of `../design-feature/SKILL.md`. The two skills share the same tool-mapping conventions.

**Chrome MCP**: this skill **refuses to run** when no Chrome MCP server is registered on the current harness (precondition 4) unless the user explicitly opts into the code-only fallback. Install Chrome MCP on the active harness before invoking the skill.

## What this skill produces

When the bootstrap completes:

- `docs/design/design-system/01-<slug>.html` ... `NN-<slug>.html` — one HTML file per identified component, marked `js: stub`, `js: partial`, or `js: ported` based on how successfully the original JSX/template was translated to vanilla JS.
- `docs/design/index.md` — catalog with a "Bootstrap status" table.
- `.markup-design/bootstrap/{inventory.md, routes.json, screenshots/}` — auxiliary artifacts the user can inspect and re-run individual steps against.

## Preconditions

Items 1–2 (composed sub-skills) are **resolved at skill start, not required to be pre-installed** — they're fetched into a per-user cache if missing and only refuse when truly unavailable. Items 3–5 are hard-fail.

1. **`brainstorming` sub-skill (superpowers) — resolved, not required.** This skill composes `brainstorming` (from `obra/superpowers`) to confirm the inventory. It does **not** need to be pre-installed: resolve it exactly as `design-feature` does — see `../design-feature/SKILL.md` § "Dependency resolution" and its § "Invoking a sub-skill". Per sub-skill: **installed plugin → fresh cache → refresh via `../design-feature/scripts/ensure-deps.sh superpowers` (Windows: `pwsh ../design-feature/scripts/ensure-deps.ps1 superpowers`) → stale cache (⚠) → refuse only when `ensure-deps` reports `"mode": "unavailable"`**. A cached copy is read inline at `<deps>/superpowers/skills/brainstorming/SKILL.md`. Refuse case: `❌ HARD: superpowers indisponível — não instalado, sem cache, e o fetch falhou (offline?). Instale https://github.com/obra/superpowers ou rode com rede.`.
2. **`frontend-design` sub-skill — resolved, not required.** Anthropic's official plugin (marketplace `anthropics/claude-code`, path `plugins/frontend-design` — **separate from superpowers**), may be called for individual port refinements. Same resolution as item 1 with dep name `frontend-design`: **installed → cached via `../design-feature/scripts/ensure-deps.sh frontend-design` (Windows: `pwsh ../design-feature/scripts/ensure-deps.ps1 frontend-design`) → stale → refuse only when `"mode": "unavailable"`**. A cached copy is read inline at `<deps>/frontend-design/SKILL.md`. Refuse case: `❌ HARD: frontend-design indisponível — não instalado, sem cache, e o fetch falhou. Instale: claude plugin marketplace add anthropics/claude-code && claude plugin install frontend-design@claude-code-plugins, ou rode com rede.`.
3. **In-skill scripts present.** The skill invokes these scripts (Unix `.sh` and Windows `.ps1` variants ship as pairs):

   - `../design-feature/scripts/doctor.sh`
   - `../design-feature/scripts/promote.sh`
   - `../design-feature/scripts/sync-index.sh`
   - `../design-feature/scripts/lint-ds.sh`
   - `../design-feature/scripts/ensure-deps.sh`

   They ship with the `design-skills` plugin and require no installation. If any is missing (i.e., a partial install), abort with `❌ HARD: scripts ausentes em ../design-feature/scripts/. Reinstale design-skills`. (`validate.mjs` enforces that each path above resolves to both `.sh` and `.ps1` siblings on disk.)
4. **Chrome MCP server available on the current harness.** This skill SNAPSHOTS the running app — without Chrome MCP the user would have to hand-translate each component, which is more work than starting fresh. Detect the server by looking for: `mcp__claude-in-chrome__*` or `mcp__chrome-devtools__*` on **Claude Code**; tools registered by `chrome-devtools` on **Gemini CLI**; tools registered by `chrome_devtools` on **Codex CLI**. If no Chrome MCP server is registered: refuse with a clear message giving the install path for the active harness — **Claude Code (preferred):** the [Claude for Chrome extension](https://chromewebstore.google.com/detail/claude/fcoeoabgfenejglbffodgkkbkcdhcgfn) activated with `claude --chrome` or `/chrome` in-session (requires Claude Code 2.0.73+; Chrome/Edge only); fallback for WSL/Brave/Arc: `claude mcp add chrome-devtools npx chrome-devtools-mcp@latest`. **Gemini CLI:** `gemini mcp add chrome-devtools npx chrome-devtools-mcp@latest`. **Codex CLI:** `codex mcp add chrome-devtools -- npx chrome-devtools-mcp@latest` (Codex's Chrome extension is currently Codex-app-only, not exposed to the CLI). OR offer to fall back to a "code-only" path where the agent reads each React/Vue file and writes vanilla JS by hand. Default to refuse; only fall back if the user explicitly asks.
5. **design-feature bundled template available** — `bootstrap-design-system` reads `skills/design-feature/templates/ds-component-pattern.md` during Step C and Step D. The CLI install bundles both skills together (same `design-skills` package), so this is implicit, but if the template file is missing the bootstrap MUST abort with: `❌ HARD: template do design-feature não encontrado em templates/ds-component-pattern.md. Reinstale design-skills`.

## Soft dependency

- **Markup-server reachable** — optional (`MARKUP_URL` + `MARKUP_TOKEN` env vars set; `../design-feature/scripts/doctor.sh` exits 0). Bootstrap can complete entirely locally. If connected, you can run `../design-feature/scripts/promote.sh <file> <slug>` manually after curation; the skill itself does not invoke it.

## Manage expectations (print at start, BEFORE any other action)

```
Bootstrap gera um Design System DRAFT a partir do app rodando. NÃO é
saída final. O que esperar:

  · Atoms (button, icon, spinner, badge) costumam portar limpo.
  · Molecules com inputs de formulário portam bem.
  · Estados de loading assíncrono, drag-and-drop, listas virtualizadas e
    fluxos multi-step geralmente precisam de limpeza manual.
  · Conte com o imprevisto — todo projeto surpreende.

Pra ~25 componentes (~7 deles complexos), conte com ~1 dia de wall-clock:
3-6h de trabalho do agente + 2-3h de gate-keeping seu.

Componentes são processados em ordem de tier — atoms portam automaticamente,
molecules recebem revisão em batelada, organisms passam por gate por item.
Você pode pausar e retomar.

Repositório: https://github.com/AlexandreCamillo/markup-cli-toolkit

Continuar? (responda "sim" pra prosseguir)
```

Wait for explicit `"sim"` (case-insensitive) before proceeding. Accept `yes` as a synonym for backwards compatibility with users who already saw the previous English prompt.

## The 5-step bootstrap (plus Step 0 preamble)

```
Step 0: Project discovery + strategy   → reuse strategy.json OR new menu
Step A: Inventory proposal             → user reviews → edited inventory
Step B: Routing + selectors            → user fixes  → routes.json
Step C: Snapshot per item              → automatic, gated by check; DS files follow ds-component-pattern.md
Step D: Port JS per item               → human gate per item; populates State decision matrix in DS file
Step E: Validate                       → final check + bootstrap status table (no QA column)
```

### Step 0 — Project discovery + framework + strategy choice

Runs after the user accepts the "Manage expectations" prompt and before Step A. The logic mirrors `design-feature` skill's Phase 0 — the two skills share the same `.markup-design/scratch/strategy.json` file.

**Pre-load (once per bootstrap run):** In parallel, read `skills/design-feature/SKILL.md` (the cross-referenced detection tables in 0.2–0.5 live there) and verify `skills/design-feature/templates/ds-component-pattern.md` is present (precondition 5). Keep both in context through Step C and Step D — do NOT re-read them per component. On resume, also reuse `strategy.json:projectRules` instead of re-reading the agent guidelines file (`AGENTS.md` / `CLAUDE.md` / `GEMINI.md`) or `docs/INDEX.md` (those don't change between features).

#### 0.1 Check for existing strategy.json

If `.markup-design/scratch/strategy.json` exists at cwd:

1. Read it.
2. Print:
   ```
   Estratégia salva: encontrei `strategy.json` de um run anterior do design-feature:
     framework: <framework>
     chosen:    <chosen> (<label>)
     saved:     <chosenAt>

   Reusar essa estratégia pro bootstrap? (sim / change / inspect)
   ```
3. `sim` → skip 0.2–0.6; proceed to Step A (the existing `strategy.json` is reused as-is).
4. `change` → run 0.2–0.6; overwrite `strategy.json`.
5. `inspect` → print the JSON contents and re-ask.

#### 0.2 Detect framework, then tooling

Use the same detection rules as `design-feature` Phase 0.1 (framework priority + ecosystem tables). See `skills/design-feature/SKILL.md` § "Phase 0 — Project discovery + framework + strategy choice" subsection "0.1 Detect framework, then tooling". Do not duplicate the tables here — read them from the design-feature SKILL.md when needed.

#### 0.3 Detect project rules

Same as `design-feature` Phase 0.2 — find the first present of `AGENTS.md` → `CLAUDE.md` → `GEMINI.md`, read it together with `docs/INDEX.md` heuristically, and capture a one-line summary into `projectRules` (with `agentRules.source` naming the file that produced it).

#### 0.4 Compose the strategy menu

Same as `design-feature` Phase 0.3 — framework-aware menu with 40 framework-prefixed strategy IDs plus `custom`.

#### 0.5 Present the menu

Same as `design-feature` Phase 0.4 — numbered list of available strategies for the detected framework, plus "Outro (descreva)".

#### 0.6 Persist the choice

Write `.markup-design/scratch/strategy.json` using the canonical schema from `skills/design-feature/SKILL.md` §0.5 (do not restate the schema here). Bootstrap's only delta is a `usedBy` array set to `["bootstrap"]` on first write — this field lives in `strategy.json`, not `state.json`. A future design-feature invocation does not consume or update `usedBy`; treat it as bootstrap-local audit only.

#### 0.7 HARD-GATE

```
<HARD-GATE>
Do NOT invoke Step A until:
  - .markup-design/scratch/strategy.json exists, AND
  - It contains a non-null `framework` field, AND
  - It contains a non-null `chosen` field, AND
  - If `chosen === "custom"`, `freeText` is non-empty.
</HARD-GATE>
```

### Step A — Inventory proposal

1. **Run heuristic detection.** Glob `src/components/**/*.{tsx,jsx,vue,svelte}` (or whatever the project uses). For each file:
   - Extract the default export name → candidate slug.
   - Parse the file to count props, child elements, and conditional branches. Prefer an AST when available: if `@typescript-eslint/parser` resolves under cwd `node_modules` (for `.tsx`/`.jsx`/`.ts`/`.js` files) or `vue-eslint-parser` resolves under cwd `node_modules` (for `.vue` files), use it. Otherwise fall back to regex counting — record `parser: "regex-fallback"` in the per-row inventory note and print the limit notice (see step 2 below) once at the top of `inventory.md`.
   - Classify as **atom** (no children significant, few props), **molecule** (1-2 levels deep, few interactions), **organism** (many children, multiple interactions), **page** (top-level routes — these are NOT components).
2. **Write `.markup-design/bootstrap/inventory.md`** as an editable table:

   ```markdown
   # Bootstrap inventory — revise e edite

   Pra cada linha, defina `action` como: `keep`, `skip`, ou `merge:<slug-existente>`.

   <!-- The preamble below is printed only when at least one row used the
        regex fallback parser; omit it when every row was parsed via AST. -->

   > ⚠ Parser fallback em uso: `@typescript-eslint/parser` (ou
   > `vue-eslint-parser`) não foi encontrado em `node_modules`. As contagens
   > de props, filhos e branches abaixo vêm de heurísticas regex e podem
   > subestimar JSX/template aninhado, spread props, ou ternários encadeados.
   > Instale o parser apropriado e re-rode o Step A pra contagens fiéis.

   | Source                              | Tier      | Slug             | Action  | Notes                       |
   |-------------------------------------|-----------|------------------|---------|-----------------------------|
   | src/components/Button.tsx           | atom      | button           | keep    |                             |
   | src/components/IconButton.tsx       | atom      | button           | merge:button | variant=icon         |
   | src/components/Sidebar.tsx          | organism  | sidebar          | keep    | drag-n-drop, ~600L          |
   | ...                                 | ...       | ...              | ...     | ...                         |
   ```

3. **Pause.** Open the file in the user's editor if possible (`code .markup-design/bootstrap/inventory.md`). Wait for explicit "continue". Re-read the file when they're back.
4. Only items with `action=keep` (or `merge:<X>`) move forward. Merge rules are applied as additional variants of the target slug.

### Step B — Routing + selectors

For each `keep` item, the agent needs to know where in the running app the component is rendered in a "canonical" state.

1. Start the dev server. Read `.markup-design/connection.json` `devServer.command`; run it in the background — Claude Code: `Bash` with `run_in_background: true`; Gemini CLI: `run_shell_command` then `&` + log file; Codex CLI: native shell with `&` + log file.
2. For each component:
   - **Detect imports.** Grep the app to find pages that import the component. If exactly one, use that route. If multiple, prompt the user.
   - **Author a `selector`** — typically `[data-testid="..."]` if the codebase uses test IDs; otherwise the agent inspects the live page (via Chrome MCP) and picks a stable selector. Validate that the selector matches by evaluating `document.querySelector(...)` against the page through the Chrome MCP server's "run JavaScript" tool (`mcp__claude-in-chrome__javascript_tool` on Claude+claude-in-chrome; `evaluate_script` on `chrome-devtools-mcp` regardless of harness).
   - **Author `seedActions`** — a sequence of `["click"|"hover"|"type", selector, ...]` that puts the component in the canonical state (e.g., open a menu, fill a form, dismiss a tooltip).
3. **Write `.markup-design/bootstrap/routes.json`:**

   ```json
   [
     { "slug": "sidebar", "route": "/projects", "selector": "[data-testid='sidebar']", "seedActions": [] },
     { "slug": "avatar-menu", "route": "/projects", "selector": "header [aria-label='user menu']", "seedActions": [["click", "header [aria-label='user menu']"]] }
   ]
   ```

4. Pause for user review. They can edit selectors and re-run validation.

### Step C — Snapshot per item

For each item, Chrome MCP performs:

1. Navigate to `route`.
2. Run each `seedAction`.
3. Capture:
   - **Subtree HTML + Computed CSS + Body inherited styles in one "run JavaScript" call** (the Chrome MCP server's `javascript_tool` / `evaluate_script` tool) — return a single JSON object:

     ```js
     {
       html: document.querySelector(selector).outerHTML,
       styles: <recursive getComputedStyle walk on the subtree>,
       bodyInherited: pick(getComputedStyle(document.body), [
         "font-family", "font-size", "line-height", "color",
         "background-color", "font-weight", "letter-spacing", "word-spacing"
       ])
     }
     ```

     The three captures are independent; batching saves Chrome MCP round-trips. The `bodyInherited` block feeds step 3a's `:root` reset (see below).
   - **Screenshot** of the bounding box (save to `.markup-design/bootstrap/screenshots/<slug>.png`).
3a. **Emit `:root` inherited-style reset.** Convert the `bodyInherited` map into a `:root { … }` block at the top of the DS file's `<style>`:

   ```css
   :root {
     font-family: <captured>;
     font-size: <captured>;
     line-height: <captured>;
     color: <captured>;
     background-color: <captured>;
     font-weight: <captured>;
     letter-spacing: <captured>;
     word-spacing: <captured>;
   }
   ```

   This catches **default inheritance** from the running app (so the DS file renders with the same baseline as the live route). It does NOT capture specific overrides on descendant elements — those still need manual cleanup. If a declaration's value is the browser default (e.g., `color: rgb(0, 0, 0)` and the app explicitly sets only one of the eight), prefer to omit that line rather than bake a default into the reset. Document the reset in §7 (Anatomy) with the note: *"baseline herdado capturado do `<body>` da rota fonte; pode precisar de limpeza manual."*
4. **CSS rewrite pass.** Replace each runtime hash class (e.g., `.css-1a2b3c`) with a deterministic BEM name derived from the slug plus the most-semantic class identifier in the JSX source (`.ds-<slug>__btn-primary`). For tokens (frequent literal values like `#ffffff`, `16px`), match against the project's `tailwind.config` or `tokens.css` and emit the variable reference (`var(--space-md)`).
5. **Write `docs/design/design-system/NN-<slug>.html`** following `templates/ds-component-pattern.md`:
   - Required sections present: §1 (All-states grid), §4 (Code API), §7 (Anatomy), §8 (Behavior).
   - §1 All-states grid: one cell per state captured via `seedActions` (single cell if only the default state was captured — flagged with a note that more `seedActions` would expand coverage).
   - §4 Code API: populated with the **original source snippet** read from `src/components/<file>.<ext>`, **preserved verbatim** — no library translation, no rewrites. After the verbatim code block, append a `<details>` block that flags the strategy fit. Two cases:

     - **Source library matches the chosen strategy** (e.g., source uses `antd` and `chosen === "react-antd-rhf"`): emit:

       ```html
       <details>
         <summary>Estratégia bate</summary>
         <p>Esse snippet usa <code>&lt;source-lib&gt;</code>, que casa com a estratégia atual <code>&lt;chosen&gt;</code>. Pode ser copiado direto em features novas que tocam esse DS.</p>
       </details>
       ```
     - **Source library differs from the chosen strategy** (e.g., source uses `Mantine` but `chosen === "react-antd-rhf"`): emit:

       ```html
       <details>
         <summary>⚠ Estratégia diverge</summary>
         <p>Esse snippet usa <code>&lt;source-lib&gt;</code>. A estratégia escolhida no Phase 0 é <code>&lt;chosen&gt;</code>. Ao implementar features que tocam esse DS, adapte o snippet pra <code>&lt;chosen&gt;</code> seguindo o §6 do template empacotado (<code>templates/ds-component-pattern.md</code>). Não traduza durante o bootstrap — preserve a fonte verbatim pra rastrear de onde veio.</p>
       </details>
       ```

     The verbatim-preserve rule applies even when the source lib is unrecognized (no library detected): emit the first form with `<source-lib>` replaced by the literal string `unknown` and the prose adjusted to *"não foi possível detectar a lib do snippet"*.
   - §7 Anatomy: `dl.tokens` table populated from the CSS-rewrite pass (token references identified during the snapshot).
   - §8 Behavior: initially a placeholder bullet list (`- [populated in Step D]`); Step D fills it as JS is ported.
   - §5 State decision matrix: initially absent. Step D adds rows as it identifies interactions. If component has ≥3 states by the end of Step D, the matrix is present; otherwise the section is omitted.
   - Tokens copied verbatim from `src/styles/tokens.css` if present, else derived from `tailwind.config.*`, else inline defaults (same rule as the bundled template).
   - `data-ds-component="<slug>"` marker on `.page` wrapper (unchanged).
   - IIFE script: `window.DS.<slug> = { init(root, opts) { /* TODO: port from src/components/<file> */ } }` with `js: stub` front-matter (Step D ports this).
6. After all snapshots, run `../design-feature/scripts/lint-ds.sh <ds-file>` (Windows: `pwsh ../design-feature/scripts/lint-ds.ps1 <ds-file>`) on each generated DS file and ensure each exits 0. Fix any structural failure before advancing.

### Step D — Port JS per item

This is the most labor-intensive step. Process the inventory in **tier order — atoms → molecules → organisms** — with tier-batched approval gates rather than one gate per item. Rationale: atoms are largely mechanical translations and don't merit a stop-the-world prompt each; organisms warrant per-item scrutiny; molecules are the middle case (batched summary).

Gate policy per tier:

| Tier      | Gate                                                                                                                          |
|-----------|-------------------------------------------------------------------------------------------------------------------------------|
| atom      | **Auto-port.** No per-item prompt. The agent flags trouble explicitly (see "Implicit gate" below); only flagged atoms surface to the user. |
| molecule  | **Batch summary review.** After all molecules in the inventory are ported, present a single summary table; user picks `aprovar tudo` or `revisar lista: <slugs>` to drill into a subset. |
| organism  | **Per-component gate.** Same as before — present delta to user, mapped mechanically per Step D.5 (`aceitar` / `refinar` / `adiar`). |

**Implicit gate (atoms only):** the agent escalates an atom from auto-port to per-item review when any of the following hold:

  - QA pass rate < 100% on the matrix (any row fails).
  - Source file imports a library not covered by the chosen strategy.
  - The source uses any of: `useReducer`, `useContext`, `useImperativeHandle`, `forwardRef`, portals, `useEffect` cleanups with subscriptions.
  - Source file exceeds 150 lines.

Otherwise the atom is silently committed with the QA-derived status (Step D.5).

**Batch summary prompt (molecules):** after the last molecule, print to the user:

```
Resumo da batelada — molecules (8 items):

  Slug              JS status   Matrix    Notes
  ----------------  ----------  --------  ------------------------------------
  text-input        ported      3/3       —
  search-bar        ported      2/2       —
  dropdown          partial     2/3       hover fires no DS mas não na rota live
  ...

aprovar tudo / revisar lista: <slugs separados por espaço>
```

If the user picks `revisar lista`, drop into the per-component organism flow for each named slug.

For each component (in inventory tier order):

1. **Read the source file.** Identify:
   - `useState`/`useReducer` → variables in the IIFE closure.
   - `useEffect` setup → call inside `init()`. Cleanup → exposed `destroy()` if needed.
   - JSX event handlers (`onClick`, `onDragStart`, `onChange`, etc.) → `addEventListener` in `init()`.
   - Conditional rendering by state → DOM mutation (`element.classList.toggle(...)`, `element.style.display = ...`).
   - `useContext` consumers → opts arguments to `init()` (e.g., `init(root, { user, theme, onSelect })`).
   - Render functions / `children` props → DOM templates inside the marker subtree (the snapshot already has them).
2. **Write the vanilla JS** into the IIFE in the DS file. Strict isolation: no shared closures with other components; everything is namespaced under `window.DS.<slug>`.
3. **Populate sections 5 and 8 of the DS file**:
   - For each interaction with a discernible state (hover, focus, disabled, loading, error, success, expanded, etc.), append a row to **§5 State decision matrix**: state · trigger · visual · aria.
   - For each interaction's runtime contract, append a bullet to **§8 Behavior**.
   - If the component has fewer than 3 states by the end of porting, the §5 matrix is omitted (it's not required by the bundled template at that count). §8 is still populated.
4. **Run QA via Chrome MCP** against both the DS file (`file://`) and the live route. The QA contract is inherited from `design-feature` § "Phase 5 — Visual+behavior QA" — same auto-sweep (F1), same forced `Cause: …` diagnosis (F2), same `state.json:chromeMcp.<capability>` tool-name references (F3), and same screenshot persistence to `.markup-design/qa/<slug>/<YYYY-MM-DD-HHMMSS>/` (F4). Scenarios derive from §5 State decision matrix of the DS file. If §5 is absent (fewer than 3 states), fall back to a single "snapshot in seedAction state and visual diff" — capture both targets and screenshot-diff into the same run folder. Tell the user: "automated interaction QA skipped — add more `seedActions` if you want broader coverage."
5. **Compute port-status mechanically from QA pass rate, then prompt only for what's left to humans.**

   After the QA run in step 4, compute:

   - `passRate = passingMatrixRows / totalMatrixRows` (where "passing" means visual+state delta within threshold; "matrix absent" is treated as `passRate = 1.0` for purely-visual components — see Step C.5 — so they go straight to `ported`).
   - `attempted = true` once the agent has written non-stub code into `init(...)`. If the agent never attempted a port (matrix not exercised, `init` still TODO), `attempted = false`.

   Mechanical mapping (no user prompt for the status field itself):

   | Condition                                | Front-matter `js:` value |
   |------------------------------------------|--------------------------|
   | `attempted === false`                    | `stub`                   |
   | `attempted && passRate === 1.0`          | `ported`                 |
   | `attempted && 0 < passRate < 1.0`        | `partial`                |
   | `attempted && passRate === 0`            | `partial` (with a "(custom)" annotation on every matrix row) |

   The agent writes the resulting value into the DS file's front-matter without asking. For atoms in auto-port (see Step D tier policy), this assignment is silent and the component is committed in the tier batch. For molecules and organisms, the agent then presents the delta and prompts only:

   ```
   sidebar — passRate = 2/3 = 67% → js: partial

   Próximos passos:
     1. aceitar como partial (committa, segue pra próximo)
     2. refinar agora (mais Read na fonte + Write no DS file + re-roda QA)
     3. adiar (deixa como partial, marca pra revisitar depois — sem refinar)
   ```

   The user picks one of `aceitar`, `refinar`, `adiar`:

   - `aceitar` — commit with the computed `js:` value. The "(custom)" annotations on failing matrix rows + the §8 bullets stay as-is.
   - `refinar` — agent iterates (more `Read` on source, more `Write` on DS file, re-run QA from step 4). After re-QA, recompute `passRate` and re-enter step 5. Status may flip from `partial` to `ported` or stay `partial`.
   - `adiar` — commit with the computed `js:` value. Append `<!-- TODO: bootstrap port follow-up — passRate <X>% -->` at the top of the DS file's `<style>` block so future passes find it. Update inventory `Notes` with "adiado".

   Note: `stub` is no longer a user-selectable outcome — it's the implicit value when no port was attempted (the agent skipped the component entirely from step 1). To opt out of porting a component, the user does so in the inventory (`action: skip` in Step A), not in step 5.
6. **Update inventory `Notes` column** with the current state.
7. **Commit each item separately:** `git commit -m "feat(ds): bootstrap port <slug>"`. Granular commits make it easy to revert individual ports. For atoms in auto-port (see tier gate policy above), batch the commits — one commit per tier rather than one per slug — using the message `feat(ds): bootstrap port <tier> tier (N items)`. Per-item commits are still required for molecules surfaced via `revisar lista` and for all organisms.

### Step E — Validate

1. **`../design-feature/scripts/lint-ds.sh <ds-file>`** for each DS file — must pass.
2. **`../design-feature/scripts/sync-index.sh`** — regenerate the server index. Local `docs/design/index.md` is updated by step 3 below.
3. **Append a `## Bootstrap status` section to `docs/design/index.md`:**

   ```markdown
   ## Bootstrap status

   Gerado em 2026-05-19 a partir do código existente. Itens `partial`/`stub` precisam de port de follow-up.

   | Slug          | JS status | Estados na matrix | Fonte                          |
   |---------------|-----------|-------------------|--------------------------------|
   | sidebar       | partial   | 3                 | src/components/Sidebar.tsx     |
   | avatar-menu   | ported    | 4                 | src/components/AvatarMenu.tsx  |
   | tooltip       | partial   | 0 (matrix vazia)  | src/components/Tooltip.tsx     |
   | …             | …         | …                 | …                              |
   ```

4. **Print a summary:**

   ```
   ✓ Componentes do DS: 24 no total
     - 18 ported   (JS funcional, ≥3 estados na matrix)
     -  4 partial  (JS parcial, alguns triggers falham)
     -  2 stub     (apenas referência visual)

   ⚠ Próximos passos:
     · Portar JS dos itens partial/stub quando você tocar neles de novo.
     · Rodar `design-feature` pras features novas daqui pra frente. A Phase 0 vai
       reusar a estratégia que você escolheu no bootstrap (.markup-design/scratch/strategy.json).
     · Re-rodar snapshots individuais depois de mudanças de design: invoque a
       `bootstrap-design-system` skill novamente — ela detecta DS files existentes e
       oferece re-snapshot incremental por item.
   ```

## Known limitations (document in the bootstrap status section)

- **CSS tokens duplicated** — computed styles capture resolved values, not variable references. The token-reverse-pass hits ~70%; the rest needs manual cleanup.
- **States not in the snapshot** are missing (`hover`, `focus`, `error`, `disabled` unless covered by `seedActions`).
- **Async loading states** are usually missed because snapshot captures the post-fetch DOM.
- **Portals/modals** require explicit `seedActions` (otherwise they render outside the selector subtree).
- **Virtualized lists** snapshot only the visible window.
- **CSS-in-JS** hash classes get rewritten to deterministic BEM names — works for ~80% of cases; the rest need a manual look.

## Resuming a partial bootstrap

State for bootstrap is `.markup-design/bootstrap/state.json`:

```json
{
  "schemaVersion": 1,
  "step": "step-D-port-js",
  "currentSlug": "sidebar",
  "completed": ["button", "icon-button", "breadcrumb"],
  "pending": ["sidebar", "avatar-menu", "mockup-view"],
  "framework": "react",
  "strategy": "react-antd-rhf"
}
```

- `schemaVersion` — integer. Currently `1`. Missing ⇒ treated as `0` and migrated inline (no field defaults needed for this schema yet). See `docs/SCHEMA-CHANGELOG.md`.
- `framework` — copied from `.markup-design/scratch/strategy.json:framework` after Step 0.
- `strategy` — copied from `.markup-design/scratch/strategy.json:chosen` after Step 0.

On invocation, list any `.markup-design/bootstrap/state.json` and offer to resume. On resume:

1. Read the file. Determine the current step from `step`.
2. Also read `.markup-design/scratch/strategy.json`. Compare both fields:
   - If `state.json.framework ≠ strategy.json.framework`: prompt `Bootstrap começou com framework "<old>"; o projeto agora é "<new>". Continuar com o original ("<old>") ou refazer o Step 0 pra re-escolher a estratégia?` Default: continue with original.
   - If `state.json.strategy ≠ strategy.json.chosen`: prompt `Bootstrap começou com estratégia "<old>"; o padrão atual é "<new>". Continuar com o original do bootstrap ("<old>") ou migrar pro atual ("<new>")?` Default: keep the original.
   - If `strategy.json` is absent (rare — user deleted it mid-bootstrap), recreate it from `state.json.framework` + `state.json.strategy` silently.
3. Resume from `currentSlug` rather than restart.
