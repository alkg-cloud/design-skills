# ensure-deps — Windows parity of ensure-deps.sh. Resolves design-feature's skill
# dependencies into a per-user cache (~/.markup-design/deps), honoring a TTL, and prints
# a JSON manifest to stdout. See ensure-deps.sh for the full contract.
# Exit: 0 = all requested deps usable; 1 = a dep had no cache and could not be fetched; 4 = bad args / bad TTL.
$ErrorActionPreference = 'Stop'

if ($args.Count -lt 1) { [Console]::Error.WriteLine('usage: ensure-deps.ps1 <dep> [<dep> ...] (dep: superpowers|frontend-design)'); exit 4 }

$DepsDir = if ($env:DESIGN_SKILLS_DEPS_DIR) { $env:DESIGN_SKILLS_DEPS_DIR } else { Join-Path $HOME '.markup-design/deps' }
$TtlRaw  = if ($null -ne $env:DESIGN_SKILLS_DEPS_TTL_DAYS -and $env:DESIGN_SKILLS_DEPS_TTL_DAYS -ne '') { $env:DESIGN_SKILLS_DEPS_TTL_DAYS } else { '30' }
if ($TtlRaw -notmatch '^\d+$') { [Console]::Error.WriteLine("DESIGN_SKILLS_DEPS_TTL_DAYS must be a non-negative integer, got: $TtlRaw"); exit 4 }
$TtlDays = [int]$TtlRaw
$SpRepo  = if ($env:SUPERPOWERS_REPO) { $env:SUPERPOWERS_REPO } else { 'https://github.com/obra/superpowers' }
$SpRef   = if ($env:SUPERPOWERS_REF) { $env:SUPERPOWERS_REF } else { 'main' }
$FdUrl   = if ($env:FRONTEND_DESIGN_URL) { $env:FRONTEND_DESIGN_URL } else { 'https://raw.githubusercontent.com/anthropics/claude-code/main/plugins/frontend-design/skills/frontend-design/SKILL.md' }

$StampsDir = Join-Path $DepsDir '.stamps'
New-Item -ItemType Directory -Force -Path $StampsDir | Out-Null
$Manifest = Join-Path $DepsDir 'manifest.json'
$NowEpoch = [long][DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$TtlSecs  = $TtlDays * 86400

function Root-Path($dep) { switch ($dep) {
  'superpowers'     { Join-Path $DepsDir 'superpowers' }
  'frontend-design' { Join-Path $DepsDir 'frontend-design/SKILL.md' } } }
function Sentinel-Path($dep) { switch ($dep) {
  'superpowers'     { Join-Path $DepsDir 'superpowers/skills/brainstorming/SKILL.md' }
  'frontend-design' { Join-Path $DepsDir 'frontend-design/SKILL.md' } } }

function Fetch-Superpowers {
  $dir = Join-Path $DepsDir 'superpowers'
  if (Test-Path (Join-Path $dir '.git')) {
    & git -C $dir remote set-url origin $SpRepo *> $null
    if ($LASTEXITCODE -ne 0) { return $false }
    & git -C $dir fetch --depth 1 origin $SpRef *> $null
    if ($LASTEXITCODE -ne 0) { return $false }
    & git -C $dir reset --hard "origin/$SpRef" *> $null
    return ($LASTEXITCODE -eq 0)
  } else {
    if (Test-Path $dir) { Remove-Item -Recurse -Force $dir }
    & git clone --quiet --depth 1 --branch $SpRef $SpRepo $dir *> $null
    return ($LASTEXITCODE -eq 0)
  }
}
function Fetch-FrontendDesign {
  $dir = Join-Path $DepsDir 'frontend-design'
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $tmp = [System.IO.Path]::GetTempFileName()
  try {
    & curl.exe -fsSL $FdUrl -o $tmp *> $null
    if ($LASTEXITCODE -eq 0 -and (Test-Path $tmp) -and (Get-Item $tmp).Length -gt 0) {
      Move-Item -Force $tmp (Join-Path $dir 'SKILL.md'); return $true
    }
    return $false
  } finally {
    if (Test-Path $tmp) { Remove-Item -Force $tmp -ErrorAction SilentlyContinue }
  }
}
function Do-Fetch($dep) { switch ($dep) {
  'superpowers'     { Fetch-Superpowers }
  'frontend-design' { Fetch-FrontendDesign } } }

$entries = @()
$overall = 0
foreach ($dep in $args) {
  if ($dep -notin @('superpowers','frontend-design')) { [Console]::Error.WriteLine("unknown dep: $dep"); exit 4 }
  $sentinel = Sentinel-Path $dep
  $root = (Root-Path $dep) -replace '\\','/'
  $stamp = Join-Path $StampsDir "$dep.stamp"
  $present = Test-Path $sentinel
  [long]$sEpoch = 0; $sIso = ''
  if (Test-Path $stamp) {
    $lines = @(Get-Content $stamp)
    if ($lines.Count -ge 1) { [long]::TryParse(($lines[0] -replace '[^0-9]',''), [ref]$sEpoch) | Out-Null }
    if ($lines.Count -ge 2) { $sIso = $lines[1] }
  }
  $age = $NowEpoch - $sEpoch
  $fresh = $present -and ($sEpoch -gt 0) -and ($age -lt $TtlSecs)

  if ($fresh) {
    $entries += "`"$dep`":{`"path`":`"$root`",`"mode`":`"cached`",`"fetchedAt`":`"$sIso`",`"stale`":false}"
  } elseif (Do-Fetch $dep) {
    $nowIso = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    [System.IO.File]::WriteAllLines($stamp, [string[]]@("$NowEpoch", $nowIso))
    $entries += "`"$dep`":{`"path`":`"$root`",`"mode`":`"cached`",`"fetchedAt`":`"$nowIso`",`"stale`":false}"
  } elseif ($present) {
    [Console]::Error.WriteLine("ensure-deps: $dep fetch failed; using stale cache")
    if (-not $sIso) { $sIso = 'unknown' }
    $entries += "`"$dep`":{`"path`":`"$root`",`"mode`":`"cached`",`"fetchedAt`":`"$sIso`",`"stale`":true}"
  } else {
    [Console]::Error.WriteLine("ensure-deps: $dep fetch failed and no cache present")
    $entries += "`"$dep`":{`"path`":null,`"mode`":`"unavailable`",`"fetchedAt`":null,`"stale`":false}"
    $overall = 1
  }
}
$json = '{' + ($entries -join ',') + '}'
$tmpManifest = Join-Path $DepsDir ('.manifest.' + [System.IO.Path]::GetRandomFileName())
[System.IO.File]::WriteAllText($tmpManifest, $json)
Write-Output $json
Move-Item -Force $tmpManifest $Manifest
exit $overall
