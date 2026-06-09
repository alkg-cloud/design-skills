---
name: design-feature
description: "Orchestrates the full feature-development workflow: design brainstorm + ideia mockup → promotion → tech brainstorm → plan + execute → visual+behavior QA. Keeps the Design System and code implementation in sync. Use when the user asks to design, brainstorm, or build a new feature that has a visible UI surface."
compat:
  markup: ">=0.2.0"
---

# Design-Feature Workflow

> **Convenção de idioma:** strings printadas/prompted ao usuário → PT-BR. Instruções ao agente → English.

This skill orchestrates the end-to-end lifecycle of a user-visible feature, keeping the Design System and the code implementation rigorously in sync. It composes other skills (`brainstorming` and `writing-plans` from the **superpowers** plugin, plus `frontend-design` from Anthropic's official **frontend-design** plugin) rather than replacing them.

## Cross-harness tool reference

The instructions below are written using Claude Code tool names (`Read`, `Write`, `Edit`, `Bash`, `Skill`, MCP tools prefixed `mcp__<server>__<tool>`, agent guidelines in `CLAUDE.md`). The skill also runs on **Gemini CLI** and **Codex CLI** — translate the Claude Code names using the table below as you execute each step.

| Action | Claude Code | Gemini CLI | Codex CLI |
|---|---|---|---|
| Read a file | `Read` | `read_file` | native file tool |
| Write a file | `Write` | `write_file` | native file tool |
| Edit a file | `Edit` | `replace` | native file tool |
| Run a shell command | `Bash` | `run_shell_command` | native shell tool |
| Background process | `Bash` with `run_in_background: true` | `run_shell_command` then `&` + log file (no native background flag) | native shell tool with `&` + log file |
| Search file content | `Grep` | `grep_search` | native search |
| Find files by name | `Glob` | `glob` | native glob |
| Invoke a sub-skill | `Skill: <plugin>:<skill>` (via the Skill tool) | `activate_skill('<plugin>:<skill>')` | no `Skill` tool — open the SKILL.md inline and follow it as the active instruction set |
| Dispatch subagent | `Task` / `Explore` agent | `@generalist` (or named: `@code-reviewer`) | `spawn_agent` (requires `multi_agent = true` in `~/.codex/config.toml`) |
| Track tasks | `TaskCreate` / `TaskUpdate` | `write_todos` | `update_plan` |

### Chrome MCP across harnesses

Phase 5 visual+behavior QA depends on Chrome MCP. The same server (`chrome-devtools-mcp`, from Google) runs on all three harnesses; Anthropic also ships its own `claude-in-chrome` plugin on Claude Code. Tool-name prefixes differ:

| Harness | How to install Chrome MCP | Tool reference in this skill |
|---|---|---|
| Claude Code | **Preferred:** [Claude for Chrome extension](https://chromewebstore.google.com/detail/claude/fcoeoabgfenejglbffodgkkbkcdhcgfn) (v1.0.36+) — activate with `claude --chrome` or `/chrome` in-session (Claude Code 2.0.73+; Chrome/Edge only). **Fallback** (WSL, Brave, Arc): `claude mcp add chrome-devtools npx chrome-devtools-mcp@latest`. | `mcp__claude-in-chrome__*` (extension) **or** `mcp__chrome-devtools__*` (fallback) |
| Gemini CLI | `gemini mcp add chrome-devtools npx chrome-devtools-mcp@latest`. v0.37+ also exposes a `@browser_agent` natural-language shortcut on top of the same server. | tools registered by the `chrome-devtools` MCP server (no `mcp__` prefix) |
| Codex CLI | `codex mcp add chrome-devtools -- npx chrome-devtools-mcp@latest` (writes to `~/.codex/config.toml`). The Codex Chrome extension is currently Codex-app-only and not exposed to the CLI. | tools registered by the `chrome_devtools` MCP server |

If no Chrome MCP server is registered on the current harness, the skill **skips Phase 5 automatically** and prints the manual checklist (see § "Manual checklist fallback").

### Sub-skill availability across harnesses

This skill composes sub-skills from **two** upstream plugins:

- **`brainstorming`, `writing-plans`, `subagent-driven-development`** — from the [**superpowers**](https://github.com/obra/superpowers) plugin (`obra/superpowers`).
- **`frontend-design`** — from Anthropic's [**frontend-design**](https://github.com/anthropics/claude-code/tree/main/plugins/frontend-design) plugin, shipped via the `claude-code-plugins` marketplace in `anthropics/claude-code`. (Plugin manifest name: `frontend-design`. Often pre-installed on Claude Code.)

Distribution per harness:

| Harness | superpowers | frontend-design |
|---|---|---|
| **Claude Code** | `claude plugin install obra/superpowers` (loads `Skill` tool entries) | `claude plugin marketplace add anthropics/claude-code && claude plugin install frontend-design@claude-code-plugins` |
| **Gemini CLI** | `gemini extensions install obra/superpowers` (exposes `activate_skill`) | No first-party extension; drop `plugins/frontend-design/skills/frontend-design/SKILL.md` into the Gemini skills dir |
| **Codex CLI** | `/plugins` → search `superpowers` → Install Plugin (verified 2026-05-23; superpowers ships a `.codex-plugin/` manifest). Fallback: `gh repo clone obra/superpowers ~/.codex/superpowers && mkdir -p ~/.agents/skills && ln -s ~/.codex/superpowers/skills ~/.agents/skills/superpowers`, then restart Codex. (`skill-installer` is NOT a supported install path for Codex.) | No Codex package; clone `plugins/frontend-design/skills/frontend-design` from `anthropics/claude-code` into `~/.codex/skills/frontend-design`, then restart Codex |

If a required sub-skill cannot be loaded, the Hard preconditions block below applies.

### Agent guidelines file across harnesses

During Phase 0.2 the skill reads a project-level agent guidelines file. It looks for the first present at cwd root, in priority order: **`AGENTS.md` → `CLAUDE.md` → `GEMINI.md`**. The captured one-line summary is recorded under `agentRules` in `.markup-design/scratch/strategy.json` along with which file produced it.

## In-skill scripts (no `markup-cli` required)

Deterministic operations against the Markup server are executed via shell scripts bundled with this skill at `skills/design-feature/scripts/`. The `bootstrap-design-system` skill references them through `../design-feature/scripts/`. There is no `npm install` step; the scripts use only what the host OS provides (`curl`, `bash` or PowerShell 5.1+, `grep`/`sed`/`Select-String`).

**OS dispatch.** Every operation ships as a `.sh` (Unix bash) + `.ps1` (Windows PowerShell) pair. Pick by host:

| Host                       | Invocation                                |
|----------------------------|-------------------------------------------|
| Linux, macOS, WSL          | `./scripts/<op>.sh [args]`                |
| Windows (native, no WSL)   | `pwsh ./scripts/<op>.ps1 [args]`          |

The skill prose below writes the Unix form as the canonical example; on Windows substitute the `.ps1` invocation. (The capability matrix prints which one applies to the current harness.)

**Required env vars.** Set before the skill starts:

| Var            | Required | Meaning                                                          |
|----------------|----------|------------------------------------------------------------------|
| `MARKUP_URL`   | yes      | Base URL of the Markup server, no trailing slash.                |
| `MARKUP_TOKEN` | yes      | Bearer token sent on every request.                              |

If either is unset when the skill starts, the very first `./scripts/doctor.sh` invocation in the Soft-dependency check fails with `exit 2` and a clear stderr message. The skill then refuses to advance and tells the user to set the vars.

**Op index** (full reference at `scripts/README.md`):

| Op             | Replaces                                                | Notes                                                  |
|----------------|---------------------------------------------------------|--------------------------------------------------------|
| `doctor`       | `markup-cli doctor --json`                              | GET /api/version + auth probe. Output JSON to stdout.  |
| `mockup-upload`| `markup-cli mockup new` / `markup-cli mockup version`   | POST a mockup HTML; server distinguishes new vs version |
| `promote`      | `markup-cli promote <file> --component <slug>`          | Local copy + marker + POST /api/ds/components          |
| `sync-index`   | `markup-cli sync-index`                                 | POST /api/ds/sync-index                                |
| `lint-ds`      | `markup-cli check --build --strict`                     | Pure-local structural lint; no network                 |
| `comment`      | `markup-cli comments {list,read,reply,react,resolve}`   | Subcommand dispatcher; inline `curl` is also acceptable for one-offs |

## Dependency resolution (installed → cached → stale → refuse)

This skill composes sub-skills from **superpowers** (`brainstorming`, `writing-plans`,
`subagent-driven-development`, `executing-plans`, `using-git-worktrees`) and Anthropic's
**frontend-design**. Pre-installing those plugins is the fast path, but it is **not required** —
missing sub-skills are fetched into a per-user cache at skill start and consumed by reading their
`SKILL.md` inline (the same mechanism Codex CLI already uses, since it has no `Skill` tool).

Resolve each dependency with this precedence, once at skill start:

1. **Installed plugin** — if the sub-skill appears in the harness's available-skills list, use it
   via the `Skill` tool (Claude Code) / `activate_skill` (Gemini CLI). Nothing to fetch.
2. **Fresh cache** — else, if `~/.markup-design/deps` holds a copy fetched < 30 days ago, read its
   `SKILL.md` inline.
3. **Refresh** — else run `./scripts/ensure-deps.sh <missing-deps>` (Windows:
   `pwsh ./scripts/ensure-deps.ps1 <missing-deps>`). It clones superpowers (shallow, branch `main`)
   and/or curls frontend-design's `SKILL.md` into the cache, honoring the 30-day TTL, and prints a
   manifest. On success, read the cached `SKILL.md` inline.
4. **Stale cache** — if the refresh fails (offline / no `git` / no `curl`) but a cache already
   exists, use it anyway and surface a ⚠ in the capability matrix. `ensure-deps` exits 0 and marks
   `"stale": true`.
5. **Refuse (only when truly unavailable)** — if a sub-skill is neither installed nor cached and the
   fetch fails (`ensure-deps` marks it `"mode": "unavailable"` and exits non-zero), abort with:

   > ❌ HARD: `<dep>` indisponível — não está instalado, não há cache, e o fetch falhou (offline?).
   > Instale o plugin (superpowers: https://github.com/obra/superpowers · frontend-design:
   > `claude plugin marketplace add anthropics/claude-code && claude plugin install frontend-design@claude-code-plugins`)
   > ou rode a skill com rede disponível.

   Do not perform any other action. Do not write files. Do not pretend to start.

The manifest schema (stdout of `ensure-deps`, also at `~/.markup-design/deps/manifest.json`):

```json
{ "superpowers":     { "path": "<abs>/superpowers", "mode": "cached", "fetchedAt": "<iso>", "stale": false },
  "frontend-design": { "path": "<abs>/frontend-design/SKILL.md", "mode": "cached|unavailable", "fetchedAt": "<iso>|null", "stale": false } }
```

### Invoking a sub-skill (resolution-aware)

Every "**Invoke `<sub-skill>`**" instruction in this skill resolves through the precedence above.
Build a `deps` map at skill start: `deps.<sub-skill> = { mode: "installed" | "cached", path }`
(plus `stale`). At each call site:

- `mode === "installed"` → invoke via the `Skill` tool (Claude Code) / `activate_skill` (Gemini CLI) — unchanged behavior.
- `mode === "cached"` → **read `deps.<sub-skill>.path` inline and follow it** as the active
  instruction set. For superpowers sub-skills the path is the clone root, so the file is
  `deps.<sub-skill>.path/skills/<sub-skill>/SKILL.md`; for frontend-design it is the `path` itself.

This rule is the single definition of sub-skill invocation. Call sites elsewhere in this skill say
only "Invoke `<sub-skill>`" and inherit this resolution — do not re-specify the branch per site.

## Soft dependencies (degrade gracefully, surface a disclaimer)

After the hard check passes, detect optional dependencies and surface a one-block disclaimer **before any other action**:

1. **Markup-server env vars set** — confirm `MARKUP_URL` and `MARKUP_TOKEN` are present (`printenv MARKUP_URL`, `printenv MARKUP_TOKEN`; on Windows, `$env:MARKUP_URL`, `$env:MARKUP_TOKEN`). If either is missing, comment iteration falls back to the **companion-server flow** (see Phase 1 hosting) — mockups stay local but get served over HTTP via the `brainstorming` skill's mini-server, optionally exposed via a Cloudflare quick tunnel. No hard refusal; the skill still functions in companion mode.

2. **Markup-server reachable** — only when soft-dep 1 passed. Run `./scripts/doctor.sh` (or `pwsh ./scripts/doctor.ps1` on Windows) and parse the output. Schema:

   ```json
   { "markup": { "configured": true, "url": "...", "actual": "0.2.5", "api": "v1", "ok": true } }
   ```

   - If `markup.ok === true` and `markup.actual` satisfies this skill's frontmatter `compat.markup` (semver range): full Markup-online flow.
   - If `markup.ok === true` but `markup.actual` does not satisfy `compat.markup`: degrade with a ⚠ in the capability matrix — Markup-online flow still attempted; many commands work on slightly-old servers. Don't hard-refuse.
   - If `markup.ok === true` and `markup.actual === "unknown"` (server too old to expose `/api/version`): same as the previous case — degrade with warning.
   - If `markup.ok === false` (network error, auth failure): fall back to companion-server flow same as if env vars were missing.

3. **Chrome MCP server** — check whether any Chrome MCP tools are registered. On **Claude Code**, look for `mcp__claude-in-chrome__*` (Anthropic's plugin) or `mcp__chrome-devtools__*` (Google's `chrome-devtools-mcp`). On **Gemini CLI**, look for tools under the `chrome-devtools` server registered via `gemini mcp add`. On **Codex CLI**, look for tools under the `chrome_devtools` server defined in `~/.codex/config.toml`. If no Chrome MCP server is registered on the current harness, the Phase 5 visual+behavior QA falls back to the manual checklist printed for the user.

4. **`cloudflared` on PATH** — `command -v cloudflared`. Only relevant when (2) is absent. Used to expose the local companion server publicly so users on a remote harness (VPS, mobile remote-control) can open the mockup.

### Disclaimer template

```
design-feature ready. Capability matrix:

  {superpowers:     ✓ instalado (via plugin)
                    |  ↻ cacheado fresco (~/.markup-design/deps, fetched <date>)
                    |  ⚠ cacheado stale (fetch falhou; usando cópia antiga)
                    |  ✗ indisponível (não instalado, sem cache, offline) → refuse}
  {frontend-design: ✓ instalado (via plugin)
                    |  ↻ cacheado fresco (~/.markup-design/deps/frontend-design/SKILL.md)
                    |  ⚠ cacheado stale
                    |  ✗ indisponível → refuse}
  {env:             ✓ MARKUP_URL e MARKUP_TOKEN setados
                    |  ✗ MARKUP_URL e/ou MARKUP_TOKEN ausentes
                                                ↳ setar antes de invocar a skill (export MARKUP_URL=…; export MARKUP_TOKEN=…)
                                                ↳ sem eles: hosting via companion-server}
  {markup online:   ✓ ./scripts/doctor.sh reportou <url> @ <X.Y.Z> (satisfaz compat.markup <range>)
                    |  ⚠ ./scripts/doctor.sh reportou <url> @ <X.Y.Z>, abaixo de compat.markup <range>
                                                ↳ degradando: muitos comandos ainda funcionam; suba o servidor Markup ou pin esta skill numa tag mais antiga
                    |  ⚠ ./scripts/doctor.sh reportou <url>, mas /api/version retornou unknown
                                                ↳ degradando: servidor velho demais pra anunciar a versão
                    |  ✗ ./scripts/doctor.sh falhou ou env vars ausentes
                                                ↳ sem ele: hosting via companion-server}
  {chrome:          ✓ Chrome MCP disponível (server: <server-name>, tools resolvidas em state.json:chromeMcp)  |  ✗ nenhum servidor Chrome MCP registrado
                                              ↳ instalar no Claude Code (preferido): extensão Claude for Chrome + `claude --chrome` (Chrome/Edge, Claude Code 2.0.73+)
                                                                          fallback: `claude mcp add chrome-devtools npx chrome-devtools-mcp@latest` (WSL/Brave/Arc)
                                              ↳ instalar no Gemini CLI:  `gemini mcp add chrome-devtools npx chrome-devtools-mcp@latest`
                                              ↳ instalar no Codex CLI:   `codex mcp add chrome-devtools -- npx chrome-devtools-mcp@latest` (extensão Chrome do Codex é web-app-only)
                                              ↳ sem ele: Phase 5 cai pro checklist manual}
  {cloudflared:     ✓ cloudflared disponível  |  — não instalado
                                              ↳ instalar: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
                                              ↳ opcional: expor o servidor companion publicamente}
  {strategy:        ✓ react / antd visual + react-hook-form (escolhida 2026-05-21)
                                              ↳ digite "change strategy" pra re-escolher
                    |  — primeira execução: Phase 0 vai rodar pra escolher framework + estratégia}

Repository: https://github.com/AlexandreCamillo/markup-cli-toolkit
```

Then proceed.

### Chrome MCP tool resolution (once per skill start)

Right after the capability matrix is printed (and before Phase 0 begins), resolve the Chrome MCP tool names for the registered server and persist them under `state.json:chromeMcp`. This abstracts the tool-name differences across servers/harnesses so Phase 5 step instructions can reference `state.json:chromeMcp.X` instead of branching by server name on every step.

Required capabilities and the tool-name resolution table:

| Capability   | `mcp__claude-in-chrome__*` (Anthropic plugin)      | `chrome-devtools-mcp` (Google, all harnesses) |
|--------------|----------------------------------------------------|-----------------------------------------------|
| `evaluateJs` | `mcp__claude-in-chrome__javascript_tool`           | `evaluate_script`                             |
| `screenshot` | `mcp__claude-in-chrome__upload_image` (via page capture) or browser shortcut equivalent | `take_screenshot`                |
| `click`      | `mcp__claude-in-chrome__computer` (action=click) or `form_input` for inputs | `click`                          |
| `hover`      | `mcp__claude-in-chrome__computer` (action=hover)   | `hover`                                       |
| `focus`      | `mcp__claude-in-chrome__computer` (action=focus) or `javascript_tool` with `.focus()` | `focus` (or `evaluate_script`) |
| `type`       | `mcp__claude-in-chrome__form_input`                | `type`                                        |
| `navigate`   | `mcp__claude-in-chrome__navigate`                  | `navigate_page`                               |

Procedure on skill start (after the disclaimer prints and before Phase 0):

1. Detect which Chrome MCP server is registered on the current harness (same detection as soft-dependency 3 above).
2. Build a `chromeMcp` object by mapping each capability to the resolved tool name for that server. If a capability has no direct tool on the active server, fall back to its `evaluateJs` slot (so `focus` becomes "call `evaluateJs` with `document.querySelector(sel).focus()`"). Document the fallback explicitly in the value as a comment string when needed.
3. If no Chrome MCP server is registered, set `chromeMcp = null` — Phase 5 will use the manual checklist fallback.
4. Persist the object as a sibling field of `companionServer` in the per-feature `state.json` once the feature slug is known (i.e., on the first `state.json` write of the feature). Until then, hold it in memory.

All Phase 5 step instructions reference `state.json:chromeMcp.<capability>` consistently. Do **not** branch by server name inside Phase 5 — the resolution happens once, here.

## Phase 0 — Project discovery + framework + strategy choice

Runs **once per feature**, after the capability matrix disclaimer and before Phase 1. Skipped on resume if `.markup-design/scratch/strategy.json` already exists for the current cwd and the user does not type `change strategy`.

### 0.1 Detect framework, then tooling

Read `package.json` at cwd.

**Monorepo check (before collecting deps).** Glob `**/package.json` at cwd with depth ≤ 3, excluding any path under `node_modules/`. On Claude Code: `Glob` tool with `pattern: "**/package.json"` then filter out `node_modules`. On Gemini CLI: `glob` tool. On Codex CLI: native glob.

If the glob returns 2+ matches AND the cwd's `package.json` is missing OR has empty `dependencies` and `devDependencies`, prompt the user (PT-BR):

> Detectei múltiplos `package.json` neste repositório (provavelmente um monorepo). O `package.json` da raiz está vazio/ausente, então não consigo deduzir o framework sozinho. Qual subdiretório é o "feature root" pra essa feature?
>
>   1. `<path-1>` (deps: `<top-3-deps-or-"vazio">`)
>   2. `<path-2>` (deps: `<top-3-deps-or-"vazio">`)
>   …
>   N. `<path-N>` (deps: `<top-3-deps-or-"vazio">`)
>
> Resposta (1-N):

The numbered list enumerates every glob hit, sorted by path depth ascending (shallowest first) then alphabetically. For each entry, read the `package.json` and surface the first 3 keys from `dependencies` (or `"vazio"` if empty) so the user can recognize which package is which.

When the user answers, treat the chosen path's directory as the feature root for the rest of Phase 0: every subsequent file read (`package.json`, agent guidelines, `docs/INDEX.md`, etc.) is relative to that directory, not cwd. Persist the choice into `strategy.json:featureRoot` (relative to repo root) so resume and downstream phases can rebase their reads.

If the glob returns 0 or 1 matches, OR the cwd's `package.json` has non-empty deps, no prompt — the feature root is cwd as before, and `strategy.json:featureRoot` is set to `"."`.

Collect `dependencies` + `devDependencies` from the chosen feature root's `package.json` into a single set.

**Step 1 — Framework detection (in priority order):**

| Marker in deps | Framework |
|---|---|
| `@angular/core` | `angular` |
| `react` | `react` |
| `vue` | `vue` |
| `svelte` | `svelte` |
| `solid-js` | `solid` |
| `jquery` | `jquery` |
| (nothing above) | `vanilla` |

If 2+ markers match (e.g., `react` + `jquery` in a legacy migration), prompt the user:

> Detectei múltiplos frameworks: `react`, `jquery`. Qual é o primary pra essa feature? (react / jquery)

**Step 2 — Ecosystem detection (scoped to the chosen framework):**

| Framework | UI libs | Form libs | Styling | Animation | Icons |
|---|---|---|---|---|---|
| `react` | `antd`, `@radix-ui/react-*`, `@mui/material`, `@chakra-ui/*`, `@mantine/*`, `react-bootstrap`, `@headlessui/react` | `react-hook-form`, `formik`, `@radix-ui/react-form` | `tailwindcss`, `@tailwindcss/postcss`, `@tailwindcss/vite`, `@tailwindcss/cli`, `styled-components`, `@emotion/*`, `sass`/`scss` | `framer-motion`, `motion`, `@motionone/*` | `lucide-react`, `@phosphor-icons/react`, `react-icons`, `@radix-ui/react-icons` |
| `vue` | `vuetify`, `naive-ui`, `element-plus`, `primevue`, `quasar`, `@nuxt/ui` | `vee-validate`, `@vuelidate/core`, `@formkit/vue` | `tailwindcss`, `@tailwindcss/postcss`, `@tailwindcss/vite`, `@tailwindcss/cli`, `sass`/`scss` | `@vueuse/motion`, `gsap` | `@iconify/vue`, `lucide-vue-next`, `@phosphor-icons/vue` |
| `svelte` | `@skeletonlabs/skeleton`, `flowbite-svelte`, `sveltestrap`, `bits-ui`, `@melt-ui/svelte` | `sveltekit-superforms`, `felte`, `formsnap` | `tailwindcss`, `@tailwindcss/postcss`, `@tailwindcss/vite`, `@tailwindcss/cli`, `sass`/`scss` | (svelte built-ins: `svelte/animate`, `svelte/motion`) | `lucide-svelte`, `@iconify/svelte` |
| `angular` | `@angular/material`, `primeng`, `@ng-bootstrap/ng-bootstrap`, `@taiga-ui/core`, `@ionic/angular` | (built-in: `@angular/forms`) | `tailwindcss`, `@tailwindcss/postcss`, `@tailwindcss/vite`, `@tailwindcss/cli`, `sass`/`scss` | (built-in: `@angular/animations`) | `@angular/material/icon`, `@iconify/angular` |
| `solid` | `@kobalte/core`, `@hope-ui/solid`, `@corvu/text-field` | `@modular-forms/solid` | `tailwindcss`, `@tailwindcss/postcss`, `@tailwindcss/vite`, `@tailwindcss/cli`, `solid-styled-components` | (Solid transitions built-in) | `solid-icons`, `@iconify-icon/solid` |
| `jquery` | `jquery-ui`, `bootstrap`, `foundation-sites`, `semantic-ui` | `jquery-validation`, `parsleyjs` | `bootstrap`, `foundation-sites`, plain CSS, `sass`/`scss` | (`jQuery.animate`, `gsap`) | `font-awesome`, Bootstrap icons |
| `vanilla` | (nenhum esperado) | (native `<form>` validation) | `tailwindcss` (se houver), `@tailwindcss/postcss`, `@tailwindcss/vite`, `@tailwindcss/cli`, plain CSS, `sass`/`scss` | (CSS animations, Web Animations API) | `font-awesome`, custom SVG |

Record version strings as printed in `package.json`. For Tailwind specifically, tag the detected entry in `strategy.json:detected.styling` with a major-version suffix: if any of `@tailwindcss/postcss`, `@tailwindcss/vite`, `@tailwindcss/cli` is present, tag `tailwindcss@v4` (regardless of the version literal — those packages are v4-only). Otherwise, if `tailwindcss@^3.x` or `tailwindcss@~3.x` or any explicit `3.x` is present, tag `tailwindcss@v3`. The version major drives downstream choices in Phase 4 plans (config file location, directive syntax, plugin shape).

### 0.1.5 Empty / no-framework project flow

**Triggered when ALL of these are true** (i.e., the project is greenfield, not a deliberately-vanilla project):

- 0.1 yielded `framework === 'vanilla'`, AND
- Either `package.json` is absent at cwd OR its `dependencies` + `devDependencies` are both empty or missing, AND
- `.markup-design/scratch/strategy.json` does not yet exist for this cwd (otherwise 0.6 resume handles the case where the user already picked).

When any of those is false, skip 0.1.5 and continue to 0.2 with `framework: "vanilla"` — the user *chose* vanilla deliberately and we don't re-prompt.

Print to the user (PT-BR, matching the rest of the skill):

```
Não encontrei nenhum framework definido em `package.json` (ou o arquivo nem existe ainda).

O design system desta skill é construído **em conjunto com as ferramentas que o projeto vai usar**: variantes, estados e a API de cada componente são modelados pra encaixar nos primitivos do stack escolhido. Isso:

  · evita reinventar a roda em coisas que a lib já resolve (date picker, modal, validação de form, etc.),
  · facilita a implementação (o gerador já produz código no idioma do stack),
  · mantém consistência entre o que o DS prescreve e o que o código produz.

Antes de prosseguir, escolha o stack que esse projeto vai adotar:

  1. React
  2. Vue
  3. Svelte
  4. Angular
  5. Solid
  6. jQuery
  7. Vanilla (HTML + CSS puro, sem framework JS)
  8. Outro stack (descreva)

Resposta (1-8):
```

Record the answer:

- **Options 1-7:** set top-level `framework` to the canonical key (`react`, `vue`, `svelte`, `angular`, `solid`, `jquery`, or `vanilla`). Set `detected.framework = "<canonical>@(none)"` — the `@(none)` suffix marks the version slot as "user-picked, no `package.json` evidence yet", to distinguish from the auto-detection path that fills `react@18.3.1` etc. Set `bootstrappedFromEmpty: true` in the `strategy.json` payload (see 0.5).
- **Option 8 ("Outro stack"):** follow up with `Descreva o stack (ex.: "Qwik + qwik-ui"):`. Set top-level `framework = "custom"`. Store the free text as `detected.framework = "custom: <free-text>"`. Set `bootstrappedFromEmpty: true`. Run 0.2 to capture agent guidelines (a greenfield repo can still ship `AGENTS.md`/`CLAUDE.md`/`GEMINI.md`), then skip 0.3-0.4 and go directly to 0.5 with `chosen: "custom"` and `freeText: <free-text>`.

For options 1-7, proceed to 0.2 as usual. Step 2 of 0.1 (ecosystem detection) yields empty arrays for every category — that's expected and not an error. In 0.3 the strategy menu is composed with these overrides whenever `bootstrappedFromEmpty === true`:

- The "detection-driven" rule (only add options whose UI lib is in deps) is **suspended** — the project has no deps yet. Show ALL canonical strategies for the chosen framework, in the table order.
- **Exclude any strategy whose ID contains `tailwind`**, plus the framework-specific exclusions below (these libs are Tailwind-based wrappers):

  | Framework | Also exclude |
  |---|---|
  | `svelte` | `svelte-skeleton-max`, `svelte-flowbite-max` |

- If after filtering only `custom` (and/or the vanilla baseline) would remain, that's fine — keep them. Don't synthesize new options to pad the menu.

The picked stack is binding for the rest of the feature. The skill does NOT install packages — that's up to the user or to Phase 4 plan tasks.

### 0.2 Detect project rules

- **Agent guidelines file** — check, in priority order, for `AGENTS.md` → `CLAUDE.md` → `GEMINI.md` at cwd root. Use the **first one present**; ignore the others (their content is usually a copy/symlink). Extract section headers matching `/UI|UX|design|frontend|styling|render|component|hierarchy|architecture|naming/i`. Capture the first 1-2 lines under each matching header for the strategy-prompt context. Don't try to render the whole file — just produce a one-line summary like `"client-side rendering only (AGENTS.md §17)"`, naming whichever file you actually read.

  **Zero-match fallback.** If the chosen agent-guidelines file exists but **no** header matches the regex above, the file probably uses domain-specific names for UI conventions (or doesn't cover UI at all). Don't silently skip — prompt the user (PT-BR):

  > O arquivo `<AGENTS.md|CLAUDE.md|GEMINI.md>` não tem nenhuma seção que claramente cobre convenções de UI/componente. Quer me dizer convenções relevantes antes de continuar? (ex.: *"todos os botões herdam de `<BaseButton>`"*, *"use BEM strict"*, *"ícones só do `lucide-react`"*)
  >
  > Resposta livre (ou "skip" pra continuar sem):

  Capture any non-empty answer under `strategy.json:projectRules.agentRules.userFreeText`. The auto-extracted `summary` stays empty in this branch. `skip` (or empty input) leaves `userFreeText` null and continues.
- If `docs/INDEX.md` exists → read it. List linked docs whose titles match `/UI|UX|design|frontend|component|style/i`. Don't auto-read those — list them to the user with an offer "want me to read these before proposing strategy?"
- If neither exists → skip silently. The strategy menu still works; it just has less context.

### 0.2.5 Branch check (moved from Phase 3)

This check runs **before** §0.3 strategy menu so every subsequent write — `strategy.json`, `state.json`, mockups, the DS file, the tech spec, plan, and code — lands on the chosen branch/worktree from the start. Previously this check sat at Phase 3 → 4, which caused state to be born on `main`/`master` and then orphaned if the user picked worktree.

1. Run `git rev-parse --abbrev-ref HEAD` to learn the current branch.
2. Run `git rev-parse --show-toplevel` to learn the repo root and derive `<repo-name>` (basename).
3. Run `git status --porcelain` to detect a dirty tree.
4. **If current branch is `main` or `master`:**

   Print (PT-BR):

   > Você está em `<branch>`. Esta skill grava `strategy.json`, `state.json`, mockups e (mais tarde) tech spec, plano e código. Recomendo não fazer isso direto na branch principal. Escolha:
   >
   > **A**. Criar branch `feature/design-<repo-name>` aqui mesmo
   > **B**. Criar worktree em `../<repo-name>-design/` e executar lá
   > **C**. Seguir mesmo assim na branch atual (não recomendado)
   >
   > [se tree sujo] ⚠ Working tree tem mudanças não commitadas — recomendo commitar ou stashar antes de A/B.

   - **A**: `git checkout -b feature/design-<repo-name>` → continue in same cwd.
   - **B**: prefer invoking the `using-git-worktrees` sub-skill if available — Claude Code: `Skill: superpowers:using-git-worktrees`; Gemini CLI: `activate_skill('superpowers:using-git-worktrees')`; Codex CLI: read `~/.codex/superpowers/skills/using-git-worktrees/SKILL.md` inline. If the sub-skill is unavailable, fall back to direct shell: `git worktree add ../<repo-name>-design -b feature/design-<repo-name>`. Change cwd to the new worktree path before continuing. After `cd` into the new worktree, register it: update `~/.markup-design/registry.json` per the §"Worktree registry" write trigger (set `repos[<original-repo-toplevel>].worktrees[<basename-of-worktree-path>] = <new-worktree-abs>`, stamp `schemaVersion: 1`). Print `Registrado worktree em ~/.markup-design/registry.json`.
   - **C**: continue on current branch, print `Continuando em <branch> — não recomendado.`

5. **If current branch is anything else:** print `Executando em \`<branch>\`. ✓` and continue.

**Why the branch name is generic at this point.** Phase 0.2.5 runs before the user has named the feature (that happens in Phase 1 via `brainstorming`). The branch is named after the repo (`feature/design-<repo-name>`), not the feature, so it's stable across multiple features that share Phase 0 state. Sub-plan 6 (worktree registry) tracks per-feature worktrees with finer-grained naming on top of this base branch.

**Gate.** Subsequent Phase 0 steps (0.3 strategy menu, 0.4 prompt, 0.5 persist, 0.6 resume) and every later phase MUST write into the branch/worktree picked here. Any tool that writes outside of cwd (e.g., absolute paths) must be re-rooted to the chosen worktree.

### 0.3 Compose the strategy menu (framework-aware)

The menu is dynamically generated based on the detected framework and ecosystem packages. Construction rules:

1. **Always include** a framework-appropriate "vanilla / minimal" baseline as the second-to-last option.
2. **Always include** `Outra estratégia (descreva)` as a free-text escape hatch as the last option.
3. For each detected ecosystem UI lib in the framework's column, add one canonical strategy option. If a matching form lib is also detected, add a second option that combines them.
4. If only Tailwind is detected (no UI lib): add `Headless + Tailwind utilities` ahead of the vanilla baseline.

**Strategies live in `templates/strategies.json`** (relative to this SKILL.md). That file is the single source of truth for `id`, `framework`, `label`, detection `markers`, the Code-API `adaptation` text (also shown in §6 of the bundled template), and the `canonicalSnippet` (also shown in §9 of the bundled template). Never hand-edit the strategy list anywhere else — `templates/ds-component-pattern.md` is regenerated from `strategies.json` via `node scripts/build-template.mjs`.

To compose the menu for the current invocation:

1. Read `templates/strategies.json` (relative to this SKILL.md).
2. Filter `strategies[]` to entries whose `framework` equals `detected.framework`.
3. Apply construction rules 1-4 above (vanilla baseline second-to-last, `Outro (descreva)` last, dedup by detected UI/form lib markers via each entry's `markers.ui` / `markers.form`).
4. Render each filtered entry as one numbered menu line: `<N>. <label>`.
5. Always append `Outra estratégia (descreva)` as the last numbered option, with strategy ID `custom` (the `custom` ID is a code-level special case — it is intentionally NOT present in `strategies.json`).

The user-facing menu format (numbered list + `Resposta (1-N):` prompt) does NOT change — only its data source. The menu typically shows 3-5 numbered options.

### 0.4 Present the menu

Format the prompt to the user as (React example):

```
Detectei o seguinte:
  · Framework:      react 18.3.1
  · UI libs:        antd 5.18.0
  · Forms:          react-hook-form 7.x
  · Styling:        styled-components 6.x
  · Animation:      framer-motion 11.x
  · Icons:          lucide-react 0.x
  · Project rules:  AGENTS.md menciona "client-side rendering only" (linha ~17)

Como você quer que eu modele a seção "Code API" dos DS files?

  1. antd ao máximo (Form.Item + Input + Button)
  2. antd visual + react-hook-form (Controller + antd Input)
  3. Tailwind only (sem UI lib)
  4. Native HTML/JSX + CSS
  5. Outra estratégia (descreva)

Resposta (1-5):
```

jQuery example:

```
Detectei o seguinte:
  · Framework:      jquery 3.7.x
  · UI libs:        bootstrap 5.x, jquery-ui 1.13.x
  · Forms:          jquery-validation 1.x
  · Styling:        sass

Como você quer que eu modele a seção "Code API" dos DS files?

  1. jQuery UI + Bootstrap (full kit)
  2. Bootstrap + jQuery (sem jQuery UI)
  3. jQuery puro + CSS
  4. Outra estratégia (descreva)

Resposta (1-4):
```

If the user picks "Outra estratégia" (custom), follow up with: `Descreva a estratégia em texto livre (ex.: "usar nossa lib interna @empresa/ui"):` and store the free-text under `freeText` in the JSON (with `chosen: "custom"`).

### 0.5 Persist the choice

Write `.markup-design/scratch/strategy.json`:

```json
{
  "schemaVersion": 1,
  "framework": "react",
  "chosen": "react-antd-rhf",
  "label": "antd visual + react-hook-form",
  "detected": {
    "framework": "react@18.3.1",
    "uiLibs": ["antd@5.18.0"],
    "formLibs": ["react-hook-form@7.x"],
    "styling": ["styled-components@6.x"],
    "animation": ["framer-motion@11.x"],
    "icons": ["lucide-react@0.x"]
  },
  "projectRules": {
    "agentRules": { "source": "AGENTS.md", "summary": "exists; key rule: client-side rendering only" },
    "indexMd": "present; UI docs: frontend/INDEX.md"
  },
  "chosenAt": "2026-05-21T...",
  "freeText": null,
  "bootstrappedFromEmpty": false,
  "branchCheck": {
    "ranAt": "2026-05-21T...",
    "originalBranch": "main",
    "choice": "B",
    "resultingBranch": "feature/design-myrepo",
    "worktreePath": "../myrepo-design"
  }
}
```

`schemaVersion` is `1`. Reads treat a missing `schemaVersion` as `0` and migrate inline (defaults: `bootstrappedFromEmpty=false`, `branchCheck=undefined`). See `docs/SCHEMA-CHANGELOG.md` for the compat policy.

`framework` is always set (even if `vanilla`). `chosen` is the framework-prefixed strategy ID. The two together resolve uniquely to one row in the §6 strategy-adaptation matrix of the bundled template.

`bootstrappedFromEmpty` is `true` when 0.1.5 ran (no framework markers were detected and the user picked the framework manually). Useful as audit context — e.g., Phase 4 plans can include "install <stack>" tasks first, since the project has no deps yet.

`branchCheck` records the outcome of §0.2.5. `originalBranch` is whatever `git rev-parse --abbrev-ref HEAD` returned at the moment the check ran. `choice` is `A`, `B`, or `C` (the user's pick from the §0.2.5 menu) or `null` if the original branch was already a non-default branch and no prompt was shown. `worktreePath` is `null` when `choice` is `A` or `C`. Phase 3 gate reads `strategy.json:branchCheck` to confirm the check happened.

Ensure `.markup-design/` is in `.gitignore` (existing behavior already covers this).

### 0.6 Resume mechanic

On subsequent skill invocations in the same cwd, if `.markup-design/scratch/strategy.json` exists, print:

```
Estratégia salva: antd visual + react-hook-form (escolhida 2026-05-21).
Continuar com ela? (sim / change / inspect)
```

If `bootstrappedFromEmpty === true`, append a pendant to the first line so the user knows the project's `package.json` may still be missing deps when Phase 4 runs:

```
Estratégia salva: antd visual + react-hook-form (escolhida 2026-05-21, framework escolhido manualmente em projeto vazio).
```

**Thaw `(none)` when the framework lands in `package.json`.** Still inside §0.6, before printing the `sim / change / inspect` prompt: if `bootstrappedFromEmpty === true`, re-read the feature root's `package.json` (using `strategy.json:featureRoot` if set, otherwise cwd). If the chosen `framework` (e.g., `react`) is now a real `dependencies` or `devDependencies` entry, ask the user (PT-BR):

> Project agora tem `<framework>@<version>` instalado — atualizar `detected.framework` de `@(none)` pra `@<version>`? (S/n)

Default `S` (empty input or `s`/`sim`/`y`/`yes`):
- Update `strategy.json:detected.framework` from `<framework>@(none)` to `<framework>@<version>`.
- Re-run §0.1 step 2 (ecosystem detection) on the now-populated deps so `detected.uiLibs`, `detected.formLibs`, `detected.styling`, etc. get refreshed (the previous values were all `[]` from the empty-project run).
- Leave `bootstrappedFromEmpty: true` as historical context — it's an audit field, not a live flag.
- Print: `✓ detected.framework atualizado pra <framework>@<version>; ecossistema re-detectado (<N> libs encontradas).`

`n` / `no`: skip the thaw, continue with the stale value, print: `Mantendo @(none); rode "change" pra forçar a re-detecção completa.`

If `bootstrappedFromEmpty !== true`, or the chosen framework still isn't installed, skip this prompt entirely.

- `sim` (or empty input or `y`) → skip Phase 0; proceed to feature setup.
- `change` → re-run 0.1-0.5; overwrite `strategy.json`.
- `inspect` → print the JSON contents and re-ask.

**Branch-check reuse.** Because the branch check ran at §0.2.5 (not §3), resume always picks up inside the branch/worktree that the original Phase 0 run chose. If the user has somehow moved out of that branch (e.g., manually checked out `main` mid-feature), prompt: *"O `strategy.json` foi gravado em `<originalBranch-or-worktree>`, mas você está em `<current>`. Volto pra lá ou seguimos aqui?"*. Default: jump back to `branchCheck.resultingBranch` (or `worktreePath` if set).

### 0.7 Phase 0 → Phase 1 gate

```
<HARD-GATE>
Do NOT invoke Phase 1 (brainstorming) until:
  - .markup-design/scratch/strategy.json exists, AND
  - It contains a non-null `framework` field, AND
  - It contains a non-null `chosen` field, AND
  - If `chosen === "custom"`, the `freeText` field is non-empty, AND
  - It contains a `branchCheck` object with a non-null `ranAt` (proves §0.2.5 ran).
</HARD-GATE>
```

## The 6-phase workflow

State for each feature lives at `.markup-design/scratch/<feature-slug>/state.json` so a session can resume after a context reset. On invocation, ask whether to resume any in-flight feature or start fresh.

```
                ┌─────────────────────────────────────────────┐
                │  Phase 0: Discovery + framework + strategy  │
                │  detect package.json + agent rules + branch;│
                │  present strategy menu; persist to          │
                │  .markup-design/scratch/strategy.json       │
                │  gate: strategy.json has framework + chosen │
                │        + branchCheck.ranAt                  │
                └─────────────────────┬───────────────────────┘
                                      │
                                      ▼
                ┌─────────────────────────────────────────────┐
                │  Phase 1: Design brainstorm + ideia mockup  │
                │  brainstorming (FASTPATH) + frontend-design │
                │  mockup gets the bundled tweaker panel      │
                │  iterates via Markup comments OR companion  │
                │  gate: user "aprovado" + tweaker JSON       │
                └─────────────────────┬───────────────────────┘
                                      │
                ┌─────────────────────▼───────────────────────┐
                │  Phase 2: Promote (bake + strip + reformat)  │
                │  ideia → DS file; tweaker scaffolding        │
                │  removed; locked choices baked literal;      │
                │  reformatted to bundled DS pattern           │
                │  gate: ./scripts/lint-ds.sh passes        │
                └─────────────────────┬───────────────────────┘
                                      │
                ┌─────────────────────▼───────────────────────┐
                │  Phase 3: Technical brainstorm               │
                │  brainstorming (arch/data/risks focus)       │
                │  pre-load: DS files affected, target code    │
                │  gate: tech-spec approved                    │
                │        + DS components touched section       │
                └─────────────────────┬───────────────────────┘
                                      │
                ┌─────────────────────▼───────────────────────┐
                │  Phase 4: Plan + execute                     │
                │  writing-plans (DS edits = first-class tasks)│
                │  + subagent-driven-development               │
                │  gate: tests pass, verification skill ok     │
                └─────────────────────┬───────────────────────┘
                                      │
                ┌─────────────────────▼───────────────────────┐
                │  Phase 5: Visual+behavior QA (optional)      │
                │  Chrome MCP: scenarios from State decision   │
                │  matrix table in the DS file vs live route   │
                │  loop fixes until parity (or documented      │
                │   exception)                                 │
                │  gate: parity reached                        │
                └─────────────────────┬───────────────────────┘
                                      │
                                      ▼
                                   DONE
```

## Phase 1 — Design brainstorm + ideia mockup (FASTPATH)

The intent of this phase is to produce a single self-contained HTML mockup that the user iterates on visually. Because the output is one file, parallel subagents are wasted overhead. The skill threads a `FASTPATH-DESIGN-PHASE` directive through every sub-skill invocation in this phase.

### Compose order

```
brainstorming  →  writing-plans  →  executing-plans  →  frontend-design
       │                │                  │                    │
       │                │                  │                    └─ produces mockup HTML with bundled tweaker
       │                │                  └─ runs INLINE (no subagent dispatch)
       │                └─ writes plan, no review pause
       └─ writes spec, asks design questions, no spec-review pause
```

### FASTPATH directive (passed verbatim to brainstorming and writing-plans)

> `FASTPATH-DESIGN-PHASE`: write the spec/plan to disk as usual, but do NOT pause to ask the user to review the spec or the plan. Proceed straight to the next step. For `executing-plans`, run inline — do not dispatch subagents (output is a single HTML mockup file).

Clarifying questions inside `brainstorming` (about the design itself) **stay**. Only the user-gate pauses between artifacts are removed.

### STRATEGY-CONTEXT directive (appended to brainstorming and frontend-design seeds)

> `STRATEGY-CONTEXT`: the chosen strategy is `<chosen>` (label: `<label>`, framework: `<framework>`). Consider this when proposing variants — do not propose three custom date pickers if the project already ships one via `<framework>`'s detected UI lib. The mockup is still static HTML; the strategy informs tone, variants, and affordances — not imports inside the mockup.

### Mockup contract (passed to frontend-design)

The mockup HTML must:

1. Be a self-contained file at `docs/design/mockups/<date>-<slug>-vN.html`.
2. Wrap the actual component subtree in `<div data-ds-component="<slug>">` (the tweaker uses this attribute to find the apply root).
3. Inline the bundled tweaker template verbatim — content of `templates/tweaker.html` (relative to this SKILL.md) inserted just before `</body>`.
4. Register options via `window.Tweaker.register({ title, slug, groups, apply })` where every meaningful design decision (variant, density, accent, copy variant, etc.) is exposed as an option. `apply(state, root)` maps option values to attribute/CSS-var/class assignments on the component root.
5. **Project tokens injected once per feature.** Before generating the mockup, the agent reads the project's design tokens from the **first** source that exists at cwd, in priority order:
   - `src/styles/tokens.css` (or `src/styles/tokens.scss`, `src/tokens.css`, `app/styles/tokens.css` — same file, different paths)
   - `tailwind.config.js` / `tailwind.config.ts` / `tailwind.config.mjs` → `theme.extend.colors`, `theme.extend.spacing`, `theme.extend.fontFamily`
   - `:root { … }` block inside any `src/**/*.css` file (fallback heuristic)

   Detected tokens get inlined into the mockup's `<style>` block as a `:root { --token-name: <literal-value>; … }` declaration, so the approved mockup reflects the project's brand colors/spacing/typography instead of generic placeholders. The tweaker's `apply(state, root)` may then reference those CSS vars (e.g., `root.style.setProperty('--accent', state.accent)` works against the project's accent scale).

   If no token source is detected, the agent prints to the user (PT-BR): *"Não achei `tokens.css` nem `tailwind.config.*` no projeto. O mockup vai usar valores literais — você pode aprovar assim ou parar e me apontar onde estão as design tokens."*. Default behavior on no response: continue with literal values.

   This read happens **once per feature**, not per mockup version. Cached under `state.json:projectTokens` after the first read.

The agent reads `templates/tweaker.html` (via the harness's file-read tool — see Cross-harness tool reference at the top) and pastes it into the generated mockup. The tweaker template is one source of truth — do not regenerate it per feature.

### Tweaker public API (the mockup consumes this)

```js
window.Tweaker.register({
  title: 'Pricing Card',           // shown in tweaker header; optional
  slug: 'pricing-card',            // baked into copy-JSON output
  groups: [
    { name: 'Layout', options: [
      { id: 'variant',  label: 'Variant',  type: 'radio',
        values: ['A','B','C'], default: 'A' },
      { id: 'density',  label: 'Density',  type: 'radio',
        values: ['compact','comfortable'], default: 'comfortable' },
    ]},
    { name: 'Color', options: [
      { id: 'accent', label: 'Accent', type: 'color', default: '#3b82f6' },
    ]},
  ],
  apply(state, root) {
    root.dataset.variant = state.variant;
    root.dataset.density = state.density;
    root.style.setProperty('--accent', state.accent);
  },
});
```

**Contract on `apply(state, root)`:** the body MUST be limited to direct assignments on `root` — attribute writes (`root.dataset.X`, `root.setAttribute`), inline-style sets (`root.style.setProperty`), or class toggles (`root.classList.add/remove/toggle`). No `querySelector`, no conditionals, no DOM mutation beyond these three primitives. This restriction is what makes Phase 2 bake mechanical: the promote step rewrites each assignment as a literal attribute on the rendered root, which only works if the function's static text already contains the full vocabulary. If a decision can't be expressed this way, model it as a variant in the markup (e.g., `data-variant="A|B|C"`) and let CSS branch.

**Supported `type`s** (canonical set — do **not** invent new ones):

| Type | Maps to | Use for |
|---|---|---|
| `radio` | radio group | one-of N choices (variant, density, alignment, tone). Default for multi-choice. |
| `select` | `<select>` dropdown | one-of N when the list is long (>5) or the labels are wordy. Otherwise prefer `radio`. |
| `toggle` | `<input type="checkbox">` | boolean on/off (shadow, divider, icon-visible). |
| `range` | `<input type="range">` (slider) | numeric scrub with min/max/step (radius, padding, font-size). The one "showy" control allowed. |
| `text` | `<input type="text">` | free-text copy (title, subtitle, CTA label). |
| `color` | `<input type="color">` | accent / surface colors. |

The template ships every type above pre-styled. **Pick from this list and populate the options** — do not add new control types, do not restyle existing ones, do not invent multi-select arrays. Staying inside this set is what keeps the panel on Markup's styleguide without any visual work per feature.

The previous `segmented` type was removed — use `radio` instead (same `values` shape).

#### Why the type set is closed

The panel's visual treatment follows the **Markup app styleguide** (dark teal-tinted glass at hue 165°, Manrope + JetBrains Mono, accent-as-typography). Every supported type is pre-styled in `templates/tweaker.html` against those tokens, with the values inlined as literal OKLCH/rgb (the tweaker runs inside arbitrary mockups, so it can't depend on a token sheet being present at runtime).

The closed set is the contract that keeps the panel on-style with zero per-feature design work. If you find yourself wanting a control that isn't in the table:

- **Don't** add a new control type to the template inline, restyle an existing one, or hand-roll markup outside `Tweaker.register`. That drifts the panel off the styleguide.
- **Do** model the decision as one of the six existing types — most cases fit (e.g., "compact / cozy / roomy" → `radio`; "0-100% scale" → `range`).
- If the decision genuinely can't be modeled with the six types, surface it to the user and propose adding the type to the template once, so every future mockup benefits.

When the underlying Markup styleguide changes (token values, font choice, motion curves), update the literals in `templates/tweaker.html` — that file is the single source of truth for the panel's visual.

The copy-JSON button at the top of the tweaker serializes the current state as:

```json
{ "slug": "<slug>", "version": 1, "choices": { ... } }
```

### Multi-component features

O tweaker é vinculado a um único `data-ds-component`. Se sua feature combina N componentes (filtro + lista, sidebar + main, etc.), trate como N features encadeadas — uma passada do skill por componente, na ordem em que dependem. O tech spec da Phase 3 amarra a integração entre eles.

### Phase 1 hosting — how the user opens the mockup

#### `[se Markup online]` Upload to Markup

1. Run `./scripts/mockup-upload.sh <mockup-file.html> <slug>` (Windows: `pwsh ./scripts/mockup-upload.ps1 <mockup-file.html> <slug>`). For iterations on an existing mockup, omit the `<slug>` arg — the server treats repeated POSTs of the same slug as new versions.
2. The script returns a JSON blob to stdout; read the `url` field as the hosted URL, the `id` field as the mockup ID (needed for later comment calls).
3. Print the URL to the user. Iterate via the comments flow:
   - `./scripts/comment.sh list <mockup-id> --status open` — list open threads (or `pwsh ./scripts/comment.ps1 list <id> --status open` on Windows).
   - `./scripts/comment.sh read <comment-id>` — fetch a single comment.
   - Decide: edit mockup → re-run `./scripts/mockup-upload.sh`; clarify → `./scripts/comment.sh reply <comment-id> "<body>"`; push back → reply + `./scripts/comment.sh react <comment-id> 🤔`; no change → `./scripts/comment.sh resolve <comment-id>`. After applying changes: `./scripts/comment.sh react <message-id> ✅`.
   - Re-pause with the checkpoint pattern: `Mockup hospedado em <url>. Comente no Markup, e diga "continue" quando quiser que eu processe o feedback.`

#### `[se Markup ausente]` Companion server fallback

Use the `brainstorming` skill's mini-server to host the mockup over HTTP.

**Once per session (before producing the first mockup):**

1. Locate `scripts/start-server.sh` by searching the harness-specific plugin path. Try each in order and use the first match:

   ```bash
   # Claude Code
   find ~/.claude/plugins -name start-server.sh -path '*brainstorming/scripts*' 2>/dev/null | head -1
   # Gemini CLI
   find ~/.gemini/extensions -name start-server.sh -path '*brainstorming/scripts*' 2>/dev/null | head -1
   # Codex CLI (no plugin manager — manual clone path)
   find ~/.codex/superpowers -name start-server.sh -path '*brainstorming/scripts*' 2>/dev/null | head -1
   ```

   If none match, invoke the brainstorming sub-skill via the harness's mechanism (Claude Code: `Skill: superpowers:brainstorming`; Gemini CLI: `activate_skill('superpowers:brainstorming')`; Codex CLI: read the SKILL.md inline) and use the printed base directory under `scripts/`.
2. Start the server in the background:

   ```bash
   <base>/scripts/start-server.sh \
     --project-dir <repo-root> \
     --host 0.0.0.0 \
     --url-host localhost
   ```

3. Read `<repo-root>/.superpowers/brainstorm/<session>/state/server-info` to recover `url`, `screen_dir`, `state_dir` if stdout was not captured. Map keys to camelCase when writing state.json: `screen_dir` → `screenDir`, `state_dir` → `stateDir`.
4. If `.superpowers/` is not already in `.gitignore`, append it.
5. Persist `{ url, screenDir, stateDir }` into `.markup-design/scratch/<slug>/state.json` under `companionServer`.

**Optional Cloudflare quick tunnel** — only when `cloudflared` is on PATH. Ask the user **before** printing the URL:

> Detectei `cloudflared` instalado. Quer expor o servidor via Cloudflare quick tunnel? Útil pra:
> - Rodar o harness numa VPS sem browser local
> - Controlar remotamente pelo celular (claude remote-control)
>
> ⚠ URL pública — não faça tunnel de mockup sensível. Quick tunnels rotacionam URL a cada restart.
>
> (s/n)

If `s`:

1. Pick a writable log path: `<repo-root>/.markup-design/scratch/<slug>/cloudflared.log`. Run `cloudflared tunnel --url http://localhost:<port> > <log> 2>&1 & echo $! > <pid-file>` so output is captured and the PID is preserved.
2. Poll `<log>` for a line matching `https://[a-z0-9-]+\.trycloudflare\.com` (on Claude Code: use the `Monitor` tool against the background bash if you started it via `Bash` with `run_in_background: true`; on Gemini CLI / Codex CLI: poll with `tail -n +1 -f <log>` until the regex matches, capped by timeout). **Timeout** is `MARKUP_TUNNEL_TIMEOUT_MS` if set in the environment (in milliseconds — read via the harness's shell tool, e.g. `printenv MARKUP_TUNNEL_TIMEOUT_MS`), otherwise `15000` (15 seconds). If no URL appears within the timeout: read the PID from `<pid-file>`, `kill` it, then prompt the user (PT-BR):

   > Tunnel não respondeu em `<N>`s. Tentar de novo / pular tunnel / usar localhost? (padrão: localhost)

   `<N>` is the timeout in seconds (i.e. `Math.round(MARKUP_TUNNEL_TIMEOUT_MS / 1000)`, or `15` when the env var is unset). Branch on the user's reply:

   - `tentar de novo` (or `r` / `retry`): re-spawn `cloudflared` with the same arguments, reset the log file, and re-poll with the same timeout. After two retries that both time out, fall through to `usar localhost` automatically and print: `Tunnel falhou duas vezes — caindo pra localhost.`
   - `pular tunnel` (or `s` / `skip`): same outcome as `usar localhost` (the tunnel was a Cloudflare exposure, the only fallback is localhost) — kept as a distinct option so the user can phrase the decision either way.
   - `usar localhost` (or empty input — default): continue with the local URL only; print: `Seguindo só com localhost: http://localhost:<port>.`
3. Store `tunnelUrl` into `state.json:companionServer`. Persist the `pid-file` path so a later "restart tunnel" step can locate and kill the prior process.
4. Print the tunnel URL as the **primary** link and the localhost URL as a footnote:

   > Mockup em: `https://<random>.trycloudflare.com` (tunnel ativo)
   > Local fallback: `http://localhost:<port>`

**Per mockup version:**

1. Write `docs/design/mockups/<date>-<slug>-vN.html` (canonical).
2. Write the same content to `<screenDir>/<date>-<slug>-vN.html` (server picks newest by mtime). Write the file directly — do not symlink.
3. Tell the user to refresh the URL.

**Server lifecycle:** the companion server auto-exits after 30 minutes of inactivity. Before each version write, check that `<stateDir>/server-info` exists and `<stateDir>/server-stopped` does NOT exist. If the server is gone, restart it and re-print the URL (and re-launch the tunnel if it was active).

#### `[se nem Markup nem companion]` Pure `file://` fallback

If the companion server cannot be started (e.g., the `brainstorming` skill is missing or `start-server.sh` fails), print the absolute path of the mockup HTML and tell the user to open `file://<abs-path>` in a browser, with a warning that `localStorage` may behave inconsistently under `file://`.

### Phase 1 approval gate

```
<HARD-GATE>
Do NOT invoke ./scripts/promote.sh, edit any file under docs/design/design-system/,
or commit anything until ALL of the following are true:
  - User said "aprovado" / "approved" / "ship it" explicitly in this transcript.
  - User pasted the tweaker JSON { slug, version, choices }.
  - That JSON was validated (slug matches feature slug; version checks below pass;
    choices is a flat object AND non-empty) and written to
    .markup-design/scratch/<slug>/state.json under `tweakerChoices`.

Version validation (both directions enforced):
  - If pasted `version > VERSION` (current: 1): refuse with
    "❌ template do tweaker é mais novo que a skill, atualize design-skills"
  - If pasted `version < VERSION`: refuse with
    "❌ template do tweaker é mais antigo que a skill, regenere o mockup"
  - Only `version === VERSION` advances.

Empty-tweaker refusal (every design choice is an explicit knob):
  - If `choices === {}` after parse: refuse with
    "❌ O tweaker tem zero opções — toda escolha de design tem que ser uma knob. Adicione ao menos uma opção, ou explique por escrito por que esse componente não tem nenhuma escolha variável."
  - On refusal, do NOT write state.json:tweakerChoices and do NOT advance.
</HARD-GATE>
```

When the user approves:

1. Print: `Aprovado. Clique 📋 Copy JSON no tweaker do mockup atual e cole aqui pra eu travar as escolhas.`
2. Wait for the paste.
3. Parse and validate the JSON. Expected shape: `{ slug, version, choices }`.
   - `slug` must match the feature slug.
   - `version` must equal the `VERSION` constant in `templates/tweaker.html` (currently `1`). Refuse with the PT-BR message above on mismatch — both `> VERSION` (upgrade design-skills) and `< VERSION` (regenerate mockup) abort, do not advance. Bump `VERSION` in the template and this gate together when the payload shape changes.
   - `choices` must be a flat object AND non-empty. An empty `choices` object means the mockup shipped without any explicit knobs — refuse with the empty-tweaker message above. Do not write state.json on refusal.
4. Write `state.json` (see schema below).
5. `[se Markup online]` close any still-open threads: `./scripts/comment.sh resolve <id> "closed by approval"`.
6. Ask the user: *"É um novo componente do DS, uma variante de um existente, ou composição de existentes? Se novo, qual o slug?"*

## Phase 2 — Promote (bake locked choices, strip tweaker)

1. Run `./scripts/promote.sh <mockup-file> <slug>` (Windows: `pwsh ./scripts/promote.ps1 <mockup-file> <slug>`). It copies the mockup into `docs/design/design-system/NN-<slug>.html` (auto-computing the next `NN`), ensures the `data-ds-component="<slug>"` marker is present on `<body>`, and uploads to the DS folder via `POST /api/ds/components`.

   **`[se env ausente]`** When `MARKUP_URL`/`MARKUP_TOKEN` are unset, `promote.sh` exits `2` immediately — nothing is written. Tell the user to set the env vars and re-invoke.

   **`[se Markup offline]`** When env vars are set but the server is unreachable, `promote.sh` writes the local file (with the marker injected) and exits `1` with stderr noting upload failed. Tell the user the local file is on disk; the server upload can be re-run later by re-invoking the same command once the server is back up.

2. **Bake locked choices + strip tweaker** (skill-side, via the harness's file-edit tool):
   - Delete the entire `<style>...</style>` block scoped to `.mdtk-tweaker`.
   - Delete the `<div class="mdtk-tweaker" data-mdtk-tweaker>...</div>` block.
   - Delete the IIFE `<script>` that defines `window.Tweaker`.
   - Delete the `Tweaker.register({...})` call in the mockup's component script.
   - Read the original `apply(state, root)` function body. Reproduce each assignment with literal values from `state.json:tweakerChoices`. Examples:
     - `root.dataset.variant = state.variant;` with `choices.variant === 'B'` → add `data-variant="B"` to the component root element.
     - `root.style.setProperty('--accent', state.accent);` with `choices.accent === '#3b82f6'` → add `style="--accent:#3b82f6"` to the component root element (merging with any existing inline `style`).
     - `root.classList.add(state.theme);` with `choices.theme === 'dark'` → add `class="... dark"` to the component root.
   - Once all assignments are baked, delete the `apply` function definition (it is dead code without the tweaker).

2.5. **Visual-diff post-bake** (between bake and reformat, before structural changes):
   - **Goal:** confirm the baked DS file renders identically to the approved Phase 1 mockup. If it doesn't, baking dropped something.
   - **`[se Chrome MCP]`** Screenshot both:
     - The baked DS file at `file://<repo>/docs/design/design-system/NN-<slug>.html`
     - The last-approved mockup at `docs/design/mockups/<date>-<slug>-vN.html` (read `state.json:mockupFile` for the exact path)
   - Compute the pixel-difference percentage (use the Chrome MCP server's image-diff capability if exposed; otherwise script it via `evaluate_script` reading both `<img>` sources into a `<canvas>` and counting non-matching pixels). Threshold: **5%**.
   - If diff ≤ 5%: proceed to step 3.
   - If diff > 5%: pause and print to the user (PT-BR):

     ```
     ⚠ Diff visual de <N>% entre o mockup aprovado e o DS bakeado.
        Mockup:  docs/design/mockups/<file>
        DS:      docs/design/design-system/<file>
        Provavelmente um knob baked não foi aplicado, ou uma escolha vazou pelo gate.
        Quer eu inspecionar e re-bakear, ou aprovar mesmo assim?
     ```

     Wait for user response: `inspect` → re-read `tweakerChoices` and the bake bullets, find the missing application, re-bake; `ok` → continue with documented exception in `state.json:notes`.
   - **`[manual fallback]`** No Chrome MCP: print both paths to the user and ask them to open both side-by-side, then confirm visual parity with `"parity ok"` before continuing. On `"parity fails"`: same inspect/re-bake loop as above.

3. **Reformat DS file to follow the bundled pattern** (template-driven):
   - **Preserve the attributes baked in step 2.2.** The component root element gained `data-*`, inline `style`, and/or `class` values during baking. These literals encode the user-approved choices and MUST survive the reformat. When restructuring the markup, move siblings/children around the root — never strip or rewrite the root's attributes. If the reformat genuinely needs a new root element (rare), copy the baked `data-*`, `style`, and `class` values onto the new root verbatim before deleting the old one.
   - In parallel: read `templates/ds-component-pattern.md` end-to-end (path relative to this SKILL.md) and read `.markup-design/scratch/strategy.json` to recover `framework` and `chosen`.
   - Restructure the DS file content to have the required sections (1, 4, 7, 8) and applicable optional sections (2, 3, 5, 6) as defined in the bundled template.
   - Component implemented as a single CSS recipe with state variants via `data-attrs`.
   - Section 4 ("Code API") generated using the bundled template's §6 adaptation guide for the matching `(framework, chosen)` row, and §9 example as the literal starting snippet.
   - States not natively covered by the chosen lib → flag "(custom)" in the matrix + bullet in API + comment in CSS.
   - Keep the script as an IIFE writing only to `window.DS.<slug>`.
   - Set front-matter `js: ported` (unchanged from previous behavior).

   **Reformat checklist (verify before declaring Phase 2.3 done):**

   The bundled template (`templates/ds-component-pattern.md` §3) requires sections 1, 4, 7, 8 in every DS file. After reformat, confirm each:

   - [ ] **§1 All-states grid** — the file contains at least one `.row-states` block with ≥1 cell (`<div class="state">…</div>` or equivalent labeled cell). If absent, the file is missing the headline preview — reformat is incomplete.
   - [ ] **§4 Code API** — the `pre.api` block exists AND its text content is non-empty (not just whitespace). An empty Code API means the strategy adaptation failed silently.
   - [ ] **§7 Anatomy** — the file contains a `dl.tokens` element listing the component's CSS tokens. Missing `dl.tokens` means the anatomy section was stripped during reformat.
   - [ ] **§8 Behavior** — at least one `<ul>` (or `<ol>`) under a section/header titled "Behavior" with ≥1 `<li>`. An empty Behavior section means runtime contract was not transcribed.

   If any item fails, **do not advance to step 4** (`sync-index`). Fix the reformat and re-run the checklist. The Phase 2 → 3 gate also blocks on this checklist (see "Phase 2 gate" below).

4. Run `./scripts/sync-index.sh` (Windows: `pwsh ./scripts/sync-index.ps1`).

   **`[se Markup offline]`** Skip — tell the user the DS file is on disk and the server index is stale; the same command can be re-run later when env vars are set.

5. Run `./scripts/lint-ds.sh docs/design/design-system/NN-<slug>.html` (Windows: `pwsh ./scripts/lint-ds.ps1 ...`) — must exit 0. This is pure-local; no network or env vars required. On non-zero exit, read stderr for the failing section (§1/§4/§7/§8), fix the DS file, re-run.

6. **Commit** on branch `design/<slug>` (create if needed):

   ```
   feat(ds): promote <slug> from ideia → DS (locked: <key>=<value>, <key>=<value>)
   ```

### Phase 2 gate

```
<HARD-GATE>
Do NOT invoke brainstorming for tech spec until:
  - ./scripts/lint-ds.sh on the DS file exited 0, AND
  - The Phase 2.3 reformat checklist passed (§1 has ≥1 grid cell, §4 snippet is
    non-empty, §7 has dl.tokens, §8 has ≥1 bullet), AND
  - The DS file has been committed.
</HARD-GATE>
```

## Phase 3 — Technical brainstorm

1. **Invoke `brainstorming`** scoped to *implementation*. Seed it with:
   - The DS file(s) affected (read each one).
   - The target area of the codebase (Claude Code: dispatch the `Explore` agent; Gemini CLI: `@generalist` for the search; Codex CLI: `spawn_agent` if `multi_agent = true`, otherwise direct `grep`/`glob`).
   - Existing patterns in the codebase.
   - Schema/data flow constraints.
   - Risks (concurrency, edge cases, performance).
   - `STRATEGY-CONTEXT`: chosen strategy is `<chosen>` (framework: `<framework>`). Reflect this in arch/data/risks discussion (no custom date pickers if `<framework>`'s lib ships one, etc.).
   - `DS-REFERENCE`: the tech spec MUST contain a `## DS components touched` section listing each DS file under `docs/design/design-system/` that this feature reads, edits, or adds — or explicitly state "none" with a one-line justification (e.g., *"none — this feature is a backend job with no UI surface"*, or *"none — only touches existing components without modifying them"*). The section format is one Markdown list item per file: `- \`docs/design/design-system/NN-<slug>.html\` — <reads | edits | adds> — <one-line why>`. This list feeds the Phase 4 post-plan DS-edit-task check; an empty or missing section makes that check unreliable.

2. **Output:** `docs/superpowers/specs/<date>-<slug>-tech-spec.md`. This must NOT re-design UI/UX — Phase 1 + Phase 2 settled that. If during Phase 3 a technical reality forces a design change, surface it explicitly and confirm with the user before going back to Phase 1. The spec MUST contain a `## DS components touched` section per the `DS-REFERENCE` directive in step 1 — without it, the Phase 3 gate refuses to advance.

3. **Wait for explicit user approval** of the tech spec.

### Phase 3 → 4 branch check

**Moved to §0.2.5.** The branch check now runs before §0.3 strategy menu, so every Phase 0+ write lands on the chosen branch/worktree from the start. By the time Phase 3 finishes, the working tree is already on `feature/design-<repo-name>` (option A) or inside the worktree (option B). No re-check is needed here.

### Phase 3 gate

```
<HARD-GATE>
Do NOT invoke writing-plans until ALL of the following are true:
  - User explicitly approved the tech spec at docs/superpowers/specs/<date>-<slug>-tech-spec.md.
  - Branch check from §0.2.5 already ran (it runs at Phase 0, so by Phase 3 this is
    confirmed by checking `strategy.json:branchCheck` is set — see §0.5 schema).
  - The tech spec contains a `## DS components touched` section (case-sensitive header
    match). If the section body is just "none" or "(none)", a one-line justification
    MUST follow on the same line or the next bullet. The gate greps the spec for
    `^##\s+DS components touched\s*$`; missing → refuse with:

      ❌ Tech spec falta seção `## DS components touched`. Adicione a lista (ou
         "none — <razão>") antes de aprovar.
</HARD-GATE>
```

## Phase 4 — Plan + execute

1. **Invoke `writing-plans`** with extra instruction:

   > DS adjustments are first-class plan tasks. If the implementation requires changes to a DS component, include explicit tasks to edit the DS file (following `templates/ds-component-pattern.md`, with the Code API section adapted to the strategy in `.markup-design/scratch/strategy.json`), run `./scripts/lint-ds.sh <ds-file>` (or `pwsh ./scripts/lint-ds.ps1 <ds-file>` on Windows), and commit with `feat(ds): amend <slug> (driven by <reason>)`. Any task that edits a DS file MUST be followed by `./scripts/lint-ds.sh` in the plan.

2. **Post-plan checklist (run on the file `writing-plans` just wrote, before invoking execution).** Two heuristic grep-based checks. Both run; surface any flag to the user and wait for explicit confirm-or-revise before advancing to step 3.

   - **Check A — DS-edit task presence.** Grep the tech spec at `docs/superpowers/specs/<date>-<slug>-tech-spec.md` for the substring `docs/design/design-system/`. If at least one match exists, grep the freshly-written plan for tasks whose `Files:` blocks reference a path under `docs/design/design-system/`. If the spec mentions DS paths but the plan has zero DS-edit tasks, print:

     > ⚠ O tech spec referencia arquivos em `docs/design/design-system/`, mas o plano não tem nenhuma tarefa que edita esses arquivos. Confirme se isso é intencional (ex.: a feature só consome o DS sem alterar) ou revise o plano para incluir as edições de DS necessárias.

     Wait for the user to confirm "ok, sem alterações de DS" (or equivalent) or to ask for a revision. If the user asks for a revision, re-invoke `writing-plans` with the spec's DS-path list explicitly enumerated in the seed.

   - **Check B — Test-task precedence (TDD).** Walk the plan's task list top-to-bottom. For each task, inspect both the step descriptions and the `Files:` block. Compute:
     - `firstTestTaskIndex` = index of the first task whose step descriptions match the regex `/test|spec|tdd/i` (case-insensitive) OR whose `Files:` block lists a path matching `/\b(test|tests|spec|specs|__tests__)\b/i`.
     - `firstSrcTaskIndex` = index of the first task whose `Files:` block lists a path under the project's code root. The code root is `strategy.json:detected.codeRoot` when set; otherwise fall back to `src/`, then `lib/`, then `app/`, then `apps/`, then `packages/` (first that appears in any task's `Files:` block).

     If `firstSrcTaskIndex < firstTestTaskIndex` (or `firstTestTaskIndex` is unset while `firstSrcTaskIndex` is set), print:

     > ⚠ Tarefas de teste têm que vir antes das de implementação (TDD). O plano tem tarefa de implementação (`<path-do-firstSrcTask>`) antes de qualquer tarefa de teste. Confirme se a feature genuinamente não precisa de testes novos (e justifique) ou revise o plano para incluir as tarefas de teste antes das de implementação.

     Wait for the user to confirm "ok, sem testes novos por <razão>" or to ask for a revision.

   Record the outcome of both checks in `state.json:phase4.postPlanChecklist = { dsTasks: "ok" | "confirmed-no-ds" | "revised", testPrecedence: "ok" | "confirmed-no-tests" | "revised" }`. This is what the Phase 4 gate reads.

3. **Execute via `subagent-driven-development`** (or `executing-plans` — ask the user). Unlike Phase 1, parallel subagents are useful here because plan tasks usually touch independent files.

### Phase 4 gate

```
<HARD-GATE>
Do NOT declare implementation done until:
  - The post-plan checklist (Phase 4 step 2) ran, AND any flag it raised was
    resolved by either an explicit user confirmation or a plan revision (i.e.
    `state.json:phase4.postPlanChecklist.dsTasks` and `.testPrecedence` are both
    set, and neither is in an unresolved state), AND
  - The verification-before-completion skill has been invoked, AND
  - Its evidence (test command output, type-check output, etc.) has been printed in
    this transcript, AND
  - If any DS file under docs/design/design-system/ was modified during Phase 4,
    `./scripts/lint-ds.sh <ds-file>` exited 0 (or the manual structural review was
    confirmed by the user when CLI is absent).
</HARD-GATE>
```

### Phase 4 — DS edit scope rule

Phase 4 implementation may touch DS files, but only under a narrow rule. Apply this before opening any DS file for edit during Phase 4:

**Rule.** Adding a new variant or a new state to an existing DS component during Phase 4 is allowed. Changing the visual treatment of an existing variant — anything a user would have signed off on during Phase 1 mockup approval — is not. If the change is in the second category, roll back to Phase 1: re-mockup the affected component, re-promote, re-bake, then return to Phase 4 with a new plan.

**Examples — additive, stay in Phase 4:**

1. The tech spec needs a new `size=xs` variant on the Button component that did not exist when the mockup was approved. The Phase 1 mockup did not show or exercise this size. **OK** — add the variant in Phase 4 as a DS-edit task (per Phase 4 step 1 instruction); run `./scripts/lint-ds.sh <ds-file>`; commit.
2. The tech spec needs a new `loading` state on the Form component (spinner over a disabled form) that the Phase 1 mockup did not exercise. **OK** — add the state row to the State decision matrix and add the visual to the all-states grid in Phase 4; the user's Phase 1 approval covered the rest of the form's visuals, which are unchanged.

**Examples — non-additive, roll back to Phase 1:**

1. While implementing the tech spec, you notice the approved Button's `primary` variant looks heavier than the rest of the page and want to lighten its weight or tint. **Roll back.** The user approved `primary`'s exact visual in Phase 1. Re-mockup, re-approve, re-bake. Do not silently re-tweak in Phase 4.
2. The approved Form layout uses a two-column grid, but during Phase 4 you decide a single-column layout fits the real data better. **Roll back.** Layout is what the user signed off on. Open a Phase 1 cycle to re-mockup the form.

**Heuristic.** If the change affects what a user would have approved in Phase 1, it goes back to Phase 1.

When you detect a non-additive change is needed mid-Phase-4, stop the current plan execution, print to the user:

> ⚠ Mudança detectada que afeta visual já aprovado na Phase 1 (`<componente>`, `<o que muda>`). Por regra de escopo da Phase 4, isso volta pra Phase 1: re-mockup → re-promover → re-bake → novo plano. Pausando a execução do plano atual. Confirma o rollback?

Wait for the user to confirm before re-entering Phase 1.

## Phase 5 — Visual+behavior QA

Driven by the **State decision matrix table inside the DS file**.

### When Chrome MCP is available

(All Chrome MCP tool calls below reference the resolved tool names in `state.json:chromeMcp.<capability>` — see § "Chrome MCP tool resolution" at the top of this file for how those names get computed once at skill start. Do **not** branch by server name in any step below.)

**Pre-run setup.** Compute the run folder and create it:

- `<slug>` = feature slug from `state.json:slug`.
- `<run-id>` = current local time as `YYYY-MM-DD-HHMMSS` (e.g., `2026-05-23-141207`).
- `<run-folder>` = `.markup-design/qa/<slug>/<run-id>/` (relative to repo root).
- `mkdir -p <run-folder>` via the harness's shell tool.
- Write the relative path to `state.json:qaRun.folder` and initialize `state.json:qaRun = { folder, scenarios: [], discoveredStates: [], deltas: [] }`.

1. **Start the dev server.** Read `.markup-design/connection.json` → `devServer.command` and `devServer.url`. Run the command in the background (Claude Code: `Bash` with `run_in_background: true`; Gemini CLI / Codex CLI: native shell with `&` + log file); poll the URL until it responds.

2. **For each affected DS component:** open two Chrome MCP tabs in parallel (the two URLs are independent), using `state.json:chromeMcp.navigate`:
   - Live route: `<devServer.url>/<feature-path>`
   - DS reference: `file://<repo>/docs/design/design-system/NN-<slug>.html`

3. **Matrix-driven QA — extract scenarios from the State decision matrix:**
   - Parse the `<table class="matrix">` inside the DS HTML (simple regex on the file contents, **or** call `state.json:chromeMcp.evaluateJs` against the DS tab to query the DOM).
   - Each row → one scenario: `name = state column`, `trigger = trigger column`, `expectedVisual = visual column`, `expectedAria = aria column`.
   - For each scenario:
     - Apply the trigger on the live route via the appropriate `state.json:chromeMcp.<click|hover|focus|type>` (infer from the trigger text; if unclear, mark `manual: <description>` and report).
     - Apply the same trigger on the DS file (typically a "Replay" button in the "Per-state deep dive" section, if present; otherwise visual observation from the all-states grid).
     - Call `state.json:chromeMcp.screenshot` on both tabs. Save the bytes to `<run-folder>/<scenario>-live.png` and `<run-folder>/<scenario>-ds.png`.
     - Append the scenario name to `state.json:qaRun.scenarios` (two entries: `<scenario>-live` and `<scenario>-ds`).
     - Report visual or DOM-state delta.

4. **Automatic state sweep (F1 — runs after matrix-driven QA).** This catches states the matrix author forgot to enumerate.

   **Opt-out:** when the environment variable `MARKUP_QA_SWEEP` is set to `0` (read it via the harness's shell tool, e.g., `printenv MARKUP_QA_SWEEP`), skip this whole step. Print to the user: `Auto-sweep desativado (MARKUP_QA_SWEEP=0).` and proceed to step 5. Default behavior (variable unset or any value other than `0`): run the sweep.

   On the **live route tab only**, call `state.json:chromeMcp.evaluateJs` with a script that iterates every interactive element matching this selector set and reports the elements found:

   - `[role=button]`
   - `input`
   - `select`
   - `[tabindex]`
   - `[aria-haspopup]`
   - `[data-state]`

   For each element found, trigger hover, then focus, then click (in that order) via `state.json:chromeMcp.<hover|focus|click>`, screenshotting after each interaction with names `<element-id-or-index>-<hover|focus|click>-live.png` saved under `<run-folder>`. For each interaction whose resulting visual state was **not** covered by any matrix row in step 3, append a "discovered state" entry to `state.json:qaRun.discoveredStates` as:

   ```
   <element-selector> · <interaction> · <observed-visual-summary>
   ```

   The summary is a one-line free-text description the agent writes after looking at the captured screenshot (e.g., "button background lightens, no aria change"). Surface the list of discovered states to the user in the Phase 5 summary (step 6 below).

5. **Forced diagnosis on every delta (F2).** For each delta — whether from matrix-driven QA (step 3) or auto-sweep (step 4) — the agent MUST write a one-line `Cause: …` sentence into `state.json:qaRun.deltas` **before** choosing "fix code" or "fix DS". Self-prompt template (write this prompt to yourself, in your reasoning, before invoking any edit):

   ```
   Delta encontrado em <scenario>:
     Live:     <observed>
     DS:       <expected>
     Cause: ___________________________________________
            (uma frase: por que o live diverge do DS? Ex.: "live aplica
            box-shadow do antd default; DS não define shadow no estado hover.")

   Decisão (mecânica a partir da causa):
     - Se a causa é uma propriedade que o DS cobre e o código não respeita →
       fix code (default).
     - Se a causa é uma propriedade que o código aplica e o DS não documenta →
       fix DS (raro; segue o template bundled, roda ./scripts/lint-ds.sh).
   ```

   Append the `{ scenario, cause, decision }` triplet to `state.json:qaRun.deltas` then perform the edit. Do **not** edit without the `cause` line written first — this is the F2 gate.

6. **Phase 5 summary — print to the user.** After all matrix-driven scenarios + auto-sweep + diagnosis are recorded, print:

   ```
   Phase 5 QA — <slug>

     Run folder:           <run-folder>          (screenshots: <scenario>-{live,ds}.png)
     Cenários da matrix:   <N> cobertos
     Auto-sweep:           <M> elementos varridos, <K> estados descobertos
     Deltas:               <D> total → <D-fixed-code> edits de código, <D-fixed-ds> edits de DS, <D-exception> exceções

   Estados descobertos (não estavam na matrix):
     <element-selector> · <interaction> · <resumo-visual-observado>
     ...

   Deltas resolvidos:
     <scenario> · Causa: <uma frase> · Decisão: <fix code|fix DS|exception>
     ...
   ```

   The `<run-folder>` is printed as the relative path from repo root so the user can `ls` it directly.

### Phase 5 gate

```
<HARD-GATE>
Do NOT declare the feature shipped until one of:
  - Chrome MCP QA reported zero deltas, OR
  - User said "QA passes" after the manual checklist, OR
  - User explicitly documented an accepted exception (written into the tech spec).
</HARD-GATE>
```

### Manual checklist fallback (no Chrome MCP)

Print:

\`\`\`
Chrome MCP não conectado. Visual+behavior QA é manual.

URLs pra comparar lado-a-lado:
  · Live feature:  <devServer.url>/<feature-path>
  · DS reference:  file://<repo>/docs/design/design-system/NN-<slug>.html

Pra cada linha da "State decision matrix" no DS file:
  · Aplicar o trigger no live (clique, hover, input — conforme a coluna trigger).
  · Confirmar que o visual no live bate com a coluna "visual" do DS.
  · Confirmar o aria/contract bate com a coluna "aria" do DS.

Edge cases extras (não estão na matrix mas valem checar):
  · Texto longo (line-clamp, overflow)
  · Estado vazio (se aplicável)
  · Reduced motion (DevTools → Rendering → "Emulate CSS prefers-reduced-motion")

Diga "QA passes" quando estiver satisfeito; "QA fails" + descreva o drift.
\`\`\`

## Invariants

- Never advance a phase without satisfying its `<HARD-GATE>`.
- Never modify `src/` during Phase 1-2.
- Never modify DS files during Phase 3.
- During Phase 2.3, the component root's `data-*`, inline `style`, and `class` attributes set during 2.2 baking MUST be preserved on the new root element. Reformat moves markup around the root, never strips it.
- Always run `./scripts/lint-ds.sh <ds-file>` before declaring Phase 2 done. Phase 4 completion is gated by `verification-before-completion` AND, if any DS file was edited during Phase 4, by `./scripts/lint-ds.sh` as well — DS edits never ship un-validated.
- Never create Markup folders/projects without user approval.
- The bundled tweaker template at `templates/tweaker.html` is the single source of truth — never regenerate it per feature; only Read+inline.
- The bundled DS pattern template at `templates/ds-component-pattern.md` is the single source of truth for DS file structure — Read it before writing or editing any DS file.
- Strategy choice persists in `.markup-design/scratch/strategy.json`. Read it before writing the "Code API" section of any DS file. Never assume a strategy from `package.json` on-the-fly — always go through Phase 0.
- Write `state.json` to `.markup-design/scratch/<feature-slug>/` after every gate so the workflow can resume after a context reset.

## State file

`.markup-design/scratch/<slug>/state.json`:

```json
{
  "schemaVersion": 1,
  "slug": "pricing-card",
  "phase": "phase-2-promote",
  "lastUpdated": "2026-05-21T...",
  "mockupFile": "docs/design/mockups/2026-05-21-pricing-card-v3.html",
  "dsFiles": ["docs/design/design-system/21-pricing-card.html"],
  "framework": "react",
  "strategy": "react-antd-rhf",
  "tweakerChoices": { "variant": "B", "density": "compact", "accent": "#3b82f6" },
  "lockedAt": "2026-05-21T...",
  "companionServer": {
    "url": "http://localhost:52341",
    "tunnelUrl": "https://random-words.trycloudflare.com",
    "screenDir": ".superpowers/brainstorm/12345-1706000000/content",
    "stateDir": ".superpowers/brainstorm/12345-1706000000/state",
    "pidFile": ".markup-design/scratch/<slug>/cloudflared.pid"
  },
  "chromeMcp": {
    "server": "claude-in-chrome",
    "evaluateJs": "mcp__claude-in-chrome__javascript_tool",
    "screenshot": "mcp__claude-in-chrome__upload_image",
    "click": "mcp__claude-in-chrome__computer",
    "hover": "mcp__claude-in-chrome__computer",
    "focus": "mcp__claude-in-chrome__computer",
    "type": "mcp__claude-in-chrome__form_input",
    "navigate": "mcp__claude-in-chrome__navigate"
  },
  "qaRun": {
    "folder": ".markup-design/qa/pricing-card/2026-05-23-141207",
    "scenarios": ["default-live", "default-ds", "hover-live", "hover-ds"],
    "discoveredStates": [],
    "deltas": []
  },
  "notes": "Phase 2 complete. Tech brainstorm next."
}
```

- `schemaVersion`: integer. Currently `1`. Reads treat missing `schemaVersion` as `0` and migrate inline (defaults: `chromeMcp` absent ⇒ resolve via §"Chrome MCP tool resolution"; `qaRun` absent ⇒ `null`). See `docs/SCHEMA-CHANGELOG.md` for the compat policy.
- `framework`: copied from `.markup-design/scratch/strategy.json:framework` at the first `state.json` write of this feature. Audit trail of which framework was active.
- `strategy`: copied from `.markup-design/scratch/strategy.json:chosen` at the first `state.json` write of this feature. Audit trail of which strategy was active.
- `tweakerChoices`: `null` before Phase 1 approval; flat object of `id → value` after.
- `companionServer`: `null` when Markup is online or before the first mockup write; populated when the local server is used.
- `companionServer.tunnelUrl`: `null` if the user declined the Cloudflare tunnel or `cloudflared` is absent.
- `companionServer.pidFile`: path to the file that holds the cloudflared background-process PID. `null` if the tunnel is not active. Used on resume to kill the prior tunnel before relaunching.
- `chromeMcp`: object mapping capability names (`evaluateJs`, `screenshot`, `click`, `hover`, `focus`, `type`, `navigate`) to the resolved tool name on the active Chrome MCP server. Computed once at skill start (see § "Chrome MCP tool resolution"). `null` when no Chrome MCP server is registered — Phase 5 falls back to the manual checklist in that case.
- `qaRun`: per-feature Phase 5 run record. `folder` is the relative path under `.markup-design/qa/<slug>/<YYYY-MM-DD-HHMMSS>/` where all `<scenario>-{live,ds}.png` screenshots for the latest run live. `scenarios` lists scenario IDs covered (one per matrix row plus any auto-sweep additions). `discoveredStates` lists states observed via the auto-sweep but absent from the matrix. `deltas` is an array of `{ scenario, cause, decision }` entries (one per delta found). `null` until Phase 5 runs.

**`branchCheck` lives only in `strategy.json`, not `state.json`.** Rationale: the §0.2.5 branch decision is repo-wide and persistent across features (one strategy → N features in the same worktree). Duplicating it per-feature would create two sources of truth for the same fact. Per-feature `state.json` reads `strategy.json:branchCheck` on resume (see §0.6 Branch-check reuse).

## Worktree registry

`~/.markup-design/registry.json` is a per-user index of design worktrees created by §0.2.5 Option B across all repos. It lets the skill surface in-flight features that live in a sibling worktree (the user may have `cd`'d into the main repo by accident and forgotten that work-in-progress lives next door).

Schema:

```json
{
  "schemaVersion": 1,
  "repos": {
    "/abs/path/to/repo": {
      "worktrees": {
        "<slug>": "/abs/path/to/repo-design"
      }
    }
  }
}
```

- `<slug>` is the basename of the worktree path (typically `<repo-name>-design`). One repo can have multiple entries if the user re-ran §0.2.5 from a different angle, but in practice it's one.
- Missing file or unreadable JSON ⇒ treat as `{ "schemaVersion": 1, "repos": {} }`. Do not crash.
- Missing `schemaVersion` ⇒ migrate inline (treat as version `0`, then write back with `1` on the next mutation). See `docs/SCHEMA-CHANGELOG.md`.

**Write trigger.** §0.2.5 Option B (user picked "criar worktree em `../<repo-name>-design`"). After `git worktree add` succeeds and cwd is changed:

1. Read `~/.markup-design/registry.json` (handle missing file).
2. Resolve `<repo-root-abs>` = `git rev-parse --show-toplevel` of the *original* repo (the source of the worktree, not the new worktree itself). Worktrees share the same `.git/` parent; the original repo's toplevel is the stable key.
3. Set `repos[<repo-root-abs>].worktrees[<slug>] = <worktree-abs-path>` (where `<slug>` is the basename of the new worktree path).
4. Write back with `schemaVersion: 1`. Create `~/.markup-design/` if absent.
5. Print (PT-BR): `Registrado worktree em ~/.markup-design/registry.json`.

**Read trigger.** Skill start, alongside the local-cwd resume offer (see §"Resuming an in-flight feature"). For the current repo (`git rev-parse --show-toplevel`):

1. Read `~/.markup-design/registry.json` (handle missing).
2. Look up `repos[<current-repo-toplevel>].worktrees`.
3. For each registered worktree path, check whether `<worktree>/.markup-design/scratch/*/state.json` files exist. List them under a header (PT-BR):

   ```
   Features em outros worktrees deste repo:
     - <slug-a> em <worktree-path> (phase: phase-2-promote)
     - <slug-b> em <worktree-path> (phase: phase-4-execute)

   Pra retomar uma delas, faça `cd <worktree-path>` e re-invoque a skill.
   ```

4. If the registry entry points at a path that no longer exists (`!fs.existsSync`), print: `⚠ worktree <path> registrado mas não encontrado — removendo do registry` and prune the entry on the next write.

**Why this is per-user, not per-repo.** Multiple repos may share `~/.markup-design/` for cache/registry purposes (consistent with the existing `.markup-design/` per-repo scratch convention — different files, same prefix). The registry is intentionally outside the repo so it survives `rm -rf <repo>`.

## Resuming an in-flight feature

**Cross-worktree resume (G1).** Before listing local `state.json` files, read `~/.markup-design/registry.json` per the §"Worktree registry" read trigger. If the current repo has registered worktrees other than the current cwd, print the "Features em outros worktrees deste repo" block first, then continue with the local-cwd resume offer below. Users in the wrong worktree see the pointer immediately and can `cd` over before answering the resume prompt.

On invocation, list any `.markup-design/scratch/*/state.json` and offer to resume. On resume:

1. Read the file. Determine the current phase from `phase`.
2. Also read `.markup-design/scratch/strategy.json`. Compare both fields:
   - If `state.json.framework ≠ strategy.json.framework`: prompt `Essa feature começou com framework "<old>"; o projeto agora é "<new>". Continuar com o original ("<old>") ou refazer a Phase 0 pra re-escolher a estratégia?` Default: continue with original.
   - If `state.json.strategy ≠ strategy.json.chosen` (same framework): prompt `Essa feature começou com estratégia "<old>"; o padrão atual é "<new>". Continuar com o original da feature ("<old>") ou migrar pro atual ("<new>")?` Default: keep the feature's original.
3. If `companionServer` is set: check `<stateDir>/server-info` exists and the URL responds. If not, restart the server. If `tunnelUrl` was set, read `pidFile`, `kill` that PID (ignore errors if the process is gone), then relaunch the tunnel and overwrite `pidFile`.
4. Tell the user where you are in the workflow and continue from the next step of that phase.

Update `state.json` after every gate via the harness's file-write tool.
