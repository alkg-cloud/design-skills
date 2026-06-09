#!/usr/bin/env node
// Deterministic smoke test for the design-feature Phase 0 detection logic.
// Reads test-fixtures/sample-react-app/ and the strategies.json catalog,
// then asserts the computed strategy matches the expected golden.

import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, spawn } from 'node:child_process';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const fixtureRoot = join(repoRoot, 'test-fixtures/sample-react-app');
const expectedPath = join(repoRoot, 'test-fixtures/sample-react-app.expected/strategy.json');
const strategiesPath = join(repoRoot, 'skills/design-feature/templates/strategies.json');

function fail(msg) {
  console.error(`✗ smoke-test: ${msg}`);
  process.exit(1);
}

if (!existsSync(fixtureRoot)) fail(`fixture missing: ${fixtureRoot}`);
if (!existsSync(expectedPath)) fail(`expected golden missing: ${expectedPath}`);
if (!existsSync(strategiesPath)) fail(`strategies.json missing: ${strategiesPath}`);

const pkg = JSON.parse(readFileSync(join(fixtureRoot, 'package.json'), 'utf8'));
const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
const strategies = JSON.parse(readFileSync(strategiesPath, 'utf8'));
const expected = JSON.parse(readFileSync(expectedPath, 'utf8'));

// 1. Framework detection (§0.1 step 1, priority order).
const FRAMEWORK_MARKERS = [
  ['@angular/core', 'angular'],
  ['react',         'react'],
  ['vue',           'vue'],
  ['svelte',        'svelte'],
  ['solid-js',      'solid'],
  ['jquery',        'jquery'],
];
let framework = 'vanilla';
for (const [marker, name] of FRAMEWORK_MARKERS) {
  if (marker in deps) { framework = name; break; }
}

// 2. Ecosystem detection (§0.1 step 2). Per-framework marker columns — full set is
//    documented in skills/design-feature/SKILL.md; this script covers the react row
//    in full and ships a minimal stub for other frameworks (extend when adding
//    fixtures for other stacks).
const ECO = {
  react: {
    uiLibs: ['antd', '@radix-ui/react-form', '@mui/material', '@chakra-ui/react', '@mantine/core', 'react-bootstrap', '@headlessui/react'],
    formLibs: ['react-hook-form', 'formik'],
    styling: ['tailwindcss', '@tailwindcss/postcss', '@tailwindcss/vite', '@tailwindcss/cli', 'styled-components', '@emotion/react', 'sass'],
    animation: ['framer-motion', 'motion'],
    icons: ['lucide-react', '@phosphor-icons/react', 'react-icons'],
  },
};
const eco = ECO[framework] || { uiLibs: [], formLibs: [], styling: [], animation: [], icons: [] };
function pick(cat) {
  return cat.filter(name => name in deps).map(name => `${name}@${deps[name]}`);
}
const detected = {
  framework: framework in deps ? `${framework}@${deps[framework]}` : `${framework}@(none)`,
  uiLibs: pick(eco.uiLibs),
  formLibs: pick(eco.formLibs),
  styling: pick(eco.styling),
  animation: pick(eco.animation),
  icons: pick(eco.icons),
};

// 3. Strategy selection — pick the strategies.json entry whose markers.ui ⊆ detected
//    uiLibs AND markers.form ⊆ detected formLibs, with the highest total marker
//    coverage. Empty-marker baselines (`*-vanilla`) are skipped unless nothing else
//    matches — they would otherwise win every comparison via vacuous truth.
function bareName(s) { return s.split('@')[0]; }
const detectedUiNames = new Set(detected.uiLibs.map(bareName));
const detectedFormNames = new Set(detected.formLibs.map(bareName));
let best = null;
let bestScore = -1;
for (const s of strategies.strategies) {
  if (s.framework !== framework) continue;
  const ui = s.markers?.ui || [];
  const form = s.markers?.form || [];
  if (ui.length === 0 && form.length === 0) continue;
  const uiOk = ui.every(m => detectedUiNames.has(m));
  const formOk = form.every(m => detectedFormNames.has(m));
  if (!uiOk || !formOk) continue;
  const score = ui.length + form.length;
  if (score > bestScore) { best = s; bestScore = score; }
}
if (!best) fail('no strategy matched the fixture deps — expected react-antd-rhf');

// 4. Agent rules (§0.2) — first present of AGENTS.md / CLAUDE.md / GEMINI.md.
let agentSource = null;
let agentSummary = '';
for (const f of ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md']) {
  const p = join(fixtureRoot, f);
  if (existsSync(p)) {
    agentSource = f;
    const body = readFileSync(p, 'utf8');
    const headerMatch = body.match(/^##\s+(.+?)$/m);
    if (headerMatch) agentSummary = headerMatch[1].trim();
    break;
  }
}

// 5. Build the actual result and compare against the golden.
const actual = {
  framework,
  chosen: best.id,
  label: best.label,
  detected,
  projectRules: {
    agentRules: { source: agentSource, summary: agentSummary },
  },
  freeText: null,
  bootstrappedFromEmpty: false,
  featureRoot: '.',
};

function deepNorm(v) {
  if (Array.isArray(v)) return v.map(deepNorm);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = deepNorm(v[k]);
    return out;
  }
  return v;
}
const a = JSON.stringify(deepNorm(actual), null, 2);
const e = JSON.stringify(deepNorm(expected), null, 2);
if (a !== e) {
  console.error('✗ smoke-test: detection result does not match the expected golden');
  console.error('--- expected ---');
  console.error(e);
  console.error('--- actual ---');
  console.error(a);
  process.exit(1);
}

console.log('✓ smoke-test: Phase 0 detection produces the expected strategy.json shape (react-antd-rhf).');

// SP10 — Exercise the shell scripts against the mock Markup server. Unix only;
// the .ps1 variants would need a Windows CI step (TODO: when available, mirror
// these assertions through pwsh).

const SCRIPTS_DIR = join(repoRoot, 'skills/design-feature/scripts');

function startMock() {
  const child = spawn(process.execPath, [join(repoRoot, 'scripts/mock-markup-server.mjs'), '0'], {
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  return new Promise((resolve, reject) => {
    let buf = '';
    const t = setTimeout(() => reject(new Error('mock server failed to announce port within 3s')), 3000);
    child.stdout.on('data', (d) => {
      buf += d.toString();
      const m = buf.match(/listening:(\d+)/);
      if (m) { clearTimeout(t); resolve({ child, port: Number(m[1]) }); }
    });
  });
}

function runScript(scriptPath, args, env) {
  return spawnSync(scriptPath, args, { encoding: 'utf8', env: { ...process.env, ...env } });
}

async function smokeScripts() {
  if (process.platform === 'win32') {
    console.log('⚠ smoke-test: SP10 script smoke skipped on Windows (TODO: pwsh variant).');
    return;
  }
  const { child, port } = await startMock();
  const baseEnv = { MARKUP_URL: `http://localhost:${port}`, MARKUP_TOKEN: 'test-token' };
  try {
    // doctor
    let r = runScript(join(SCRIPTS_DIR, 'doctor.sh'), [], baseEnv);
    if (r.status !== 0) fail(`doctor.sh exited ${r.status}: ${r.stderr}`);
    if (!/"actual":"0\.2\.7"/.test(r.stdout)) fail(`doctor.sh stdout missing version: ${r.stdout}`);

    // sync-index
    r = runScript(join(SCRIPTS_DIR, 'sync-index.sh'), [], baseEnv);
    if (r.status !== 0) fail(`sync-index.sh exited ${r.status}: ${r.stderr}`);

    // mockup-upload
    const tmp = mkdtempSync(join(tmpdir(), 'sp10-'));
    const mockFile = join(tmp, 'm.html');
    writeFileSync(mockFile, '<html><body>x</body></html>');
    r = runScript(join(SCRIPTS_DIR, 'mockup-upload.sh'), [mockFile, 'mock'], baseEnv);
    if (r.status !== 0) fail(`mockup-upload.sh exited ${r.status}: ${r.stderr}`);
    if (!/"id":"m_test"/.test(r.stdout)) fail(`mockup-upload.sh stdout missing id: ${r.stdout}`);

    // lint-ds — good + bad
    for (const fix of ['good.html']) {
      r = runScript(join(SCRIPTS_DIR, 'lint-ds.sh'), [join(repoRoot, 'test-fixtures/ds-lint', fix)], {});
      if (r.status !== 0) fail(`lint-ds.sh ${fix} exited ${r.status}: ${r.stderr}`);
    }
    for (const fix of ['bad-missing-grid.html', 'bad-empty-api.html', 'bad-missing-tokens.html', 'bad-empty-behavior.html']) {
      r = runScript(join(SCRIPTS_DIR, 'lint-ds.sh'), [join(repoRoot, 'test-fixtures/ds-lint', fix)], {});
      if (r.status === 0) fail(`lint-ds.sh ${fix} unexpectedly passed`);
    }

    // comment — list + read + reply + react + resolve
    for (const sub of [['list', 'm_test'], ['read', 'c_test'], ['reply', 'c_test', 'hi'], ['react', 'c_test', '✅'], ['resolve', 'c_test', 'done']]) {
      r = runScript(join(SCRIPTS_DIR, 'comment.sh'), sub, baseEnv);
      if (r.status !== 0) fail(`comment.sh ${sub.join(' ')} exited ${r.status}: ${r.stderr}`);
    }

    rmSync(tmp, { recursive: true, force: true });
  } finally {
    child.kill('SIGTERM');
  }
  console.log('✓ smoke-test: SP10 shell scripts pass against mock Markup server.');
}

await smokeScripts();

// ensure-deps — offline test against local fixtures (git local repo + file:// curl).
// No network: SUPERPOWERS_REPO points at a temp git repo, FRONTEND_DESIGN_URL at a file://.
async function smokeEnsureDeps() {
  if (process.platform === 'win32') {
    console.log('⚠ smoke-test: ensure-deps smoke skipped on Windows (TODO: pwsh variant).');
    return;
  }
  const script = join(SCRIPTS_DIR, 'ensure-deps.sh');
  const base = mkdtempSync(join(tmpdir(), 'edeps-'));

  // Build a fake superpowers upstream as a local git repo with branch main.
  const upstream = join(base, 'sp-upstream');
  mkdirSync(join(upstream, 'skills/brainstorming/scripts'), { recursive: true });
  writeFileSync(join(upstream, 'skills/brainstorming/SKILL.md'), '# brainstorming (fixture)\n');
  writeFileSync(join(upstream, 'skills/writing-plans.placeholder'), 'x');
  const g = (args, cwd) => {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8',
      env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
    if (r.status !== 0) fail(`git ${args.join(' ')} failed: ${r.stderr}`);
  };
  g(['init', '-b', 'main'], upstream);
  g(['add', '-A'], upstream);
  g(['commit', '-m', 'fixture'], upstream);

  // Build a fake frontend-design source file.
  const fdSrc = join(base, 'fd-src.md');
  writeFileSync(fdSrc, '# frontend-design (fixture)\n');

  const cache = join(base, 'cache');
  const env = {
    DESIGN_SKILLS_DEPS_DIR: cache,
    SUPERPOWERS_REPO: `file://${upstream}`,
    SUPERPOWERS_REF: 'main',
    FRONTEND_DESIGN_URL: `file://${fdSrc}`,
  };
  const run = (extraEnv) => spawnSync(script, ['superpowers', 'frontend-design'],
    { encoding: 'utf8', env: { ...process.env, ...env, ...extraEnv } });

  // (a) first miss → clone+curl, both cached & fresh
  let r = run();
  if (r.status !== 0) fail(`ensure-deps first run exited ${r.status}: ${r.stderr}`);
  if (!existsSync(join(cache, 'superpowers/skills/brainstorming/SKILL.md'))) fail('superpowers not cloned');
  if (!existsSync(join(cache, 'frontend-design/SKILL.md'))) fail('frontend-design not fetched');
  if (!/"superpowers":\{[^}]*"mode":"cached"[^}]*"stale":false/.test(r.stdout)) fail(`superpowers not cached/fresh: ${r.stdout}`);
  if (!/"frontend-design":\{[^}]*"mode":"cached"[^}]*"stale":false/.test(r.stdout)) fail(`frontend-design not cached/fresh: ${r.stdout}`);

  // (b) second run within TTL → no refetch (stamp content unchanged)
  const stamp = join(cache, '.stamps/superpowers.stamp');
  const stampContent1 = readFileSync(stamp, 'utf8');
  r = run();
  if (r.status !== 0) fail(`ensure-deps fresh run exited ${r.status}`);
  if (readFileSync(stamp, 'utf8') !== stampContent1) fail('fresh cache should not refetch (stamp changed)');

  // (c) TTL=0 forces refresh (stamp content changes), still exit 0 + fresh.
  // Sleep 1100 ms so the epoch second in the stamp is guaranteed to differ.
  await new Promise(res => setTimeout(res, 1100));
  r = run({ DESIGN_SKILLS_DEPS_TTL_DAYS: '0' });
  if (r.status !== 0) fail(`ensure-deps TTL=0 run exited ${r.status}`);
  if (readFileSync(stamp, 'utf8') === stampContent1) fail('TTL=0 should force a refetch (stamp unchanged)');

  // (d) offline + stale cache → exit 0, stale:true
  r = run({ DESIGN_SKILLS_DEPS_TTL_DAYS: '0', SUPERPOWERS_REPO: `file://${base}/does-not-exist` });
  if (r.status !== 0) fail(`offline-with-cache should exit 0, got ${r.status}: ${r.stderr}`);
  if (!/"superpowers":\{[^}]*"stale":true/.test(r.stdout)) fail(`expected stale:true offline: ${r.stdout}`);

  // (e) offline + no cache → non-zero exit, mode unavailable
  const cache2 = join(base, 'cache2');
  r = spawnSync(script, ['superpowers'], { encoding: 'utf8',
    env: { ...process.env, ...env, DESIGN_SKILLS_DEPS_DIR: cache2, SUPERPOWERS_REPO: `file://${base}/nope` } });
  if (r.status === 0) fail('offline-without-cache should exit non-zero');
  if (!/"superpowers":\{[^}]*"mode":"unavailable"/.test(r.stdout)) fail(`expected mode unavailable: ${r.stdout}`);

  // (f) clone succeeds but the sentinel (skills/brainstorming/SKILL.md) is absent →
  //     must NOT report cached; treated as unavailable (guards against upstream path renames).
  const noSentinel = join(base, 'sp-nosentinel');
  mkdirSync(join(noSentinel, 'skills'), { recursive: true });
  writeFileSync(join(noSentinel, 'README.md'), '# no brainstorming here\n');
  g(['init', '-b', 'main'], noSentinel);
  g(['add', '-A'], noSentinel);
  g(['commit', '-m', 'no-sentinel fixture'], noSentinel);
  const cache3 = join(base, 'cache3');
  r = spawnSync(script, ['superpowers'], { encoding: 'utf8',
    env: { ...process.env, ...env, DESIGN_SKILLS_DEPS_DIR: cache3, SUPERPOWERS_REPO: `file://${noSentinel}` } });
  if (r.status === 0) fail('clone-without-sentinel should exit non-zero');
  if (!/"superpowers":\{[^}]*"mode":"unavailable"/.test(r.stdout)) fail(`clone-without-sentinel: expected mode unavailable: ${r.stdout}`);

  rmSync(base, { recursive: true, force: true });
  console.log('✓ smoke-test: ensure-deps fetch/cache/TTL/offline branches pass.');
}

await smokeEnsureDeps();
