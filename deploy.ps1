param(
    [string]$ModsDirectory = "$env:USERPROFILE\Documents\My Games\0ad\mods",
    [switch]$NoEnable
)

$ErrorActionPreference = "Stop"

$source = $PSScriptRoot
$target = Join-Path $ModsDirectory "rules"

# The mod is the repository root, so everything in it is part of the mod except these helpers.
# tools/pyromod.py uses the same list when it cleans up the built .pyromod.
$repositoryOnly = @(".git", ".github", ".dist", "output", "tools", "README.md", "deploy.ps1", ".gitignore")

if (-not (Test-Path (Join-Path $source "mod.json")))
{
    throw "mod.json not found in '$source' - the mod has to be the repository root."
}

if (-not (Test-Path $ModsDirectory))
{
    throw "The 0 A.D. mods directory '$ModsDirectory' doesn't exist. Pass -ModsDirectory."
}

# A release downloaded into the mod folder (mods/rules/rules.zip) would shadow the loose files
# below, so report it before the mirror removes it.
$archives = Get-ChildItem $target -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Extension -in @(".zip", ".pyromod") }
foreach ($archive in $archives)
{
    Write-Output "Removing '$($archive.Name)': a copy of the mod inside the mod folder would take precedence over these files."
}

# Mirror the mod, so that removed files don't stay behind.
if (Test-Path $target)
{
    Remove-Item $target -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $target | Out-Null

foreach ($item in (Get-ChildItem $source -Force))
{
    if ($repositoryOnly -contains $item.Name)
    {
        continue
    }
    Copy-Item -LiteralPath $item.FullName -Destination $target -Recurse -Force
}
Write-Output "Deployed to '$target':"
Get-ChildItem $target -Recurse -File |
    ForEach-Object { Write-Output "  " + $_.FullName.Replace($target + "\", "") }

if ($NoEnable)
{
    exit 0
}

# Add the mod to mod.enabledmods, so that it is loaded on the next start.
$userCfg = Join-Path $env:APPDATA "0ad\config\user.cfg"
if (-not (Test-Path $userCfg))
{
    Write-Output "No user.cfg at '$userCfg', enable the mod in Settings -> Mod Selection."
    exit 0
}

# Read and write the file manually: Set-Content -Encoding UTF8 would prepend a byte order mark,
# which the game's config parser doesn't expect.
$text = [System.IO.File]::ReadAllText($userCfg)

if ($text -match '(?ms)^mod\.enabledmods\s*=\s*"(.*?)"\s*$' -and $Matches[1] -match '\brules\b')
{
    Write-Output "The mod is already enabled in user.cfg."
    exit 0
}

$updated = $text -replace '(?m)^(mod\.enabledmods\s*=\s*"[^"]*)("\s*)$', '$1 rules$2'

if ($updated -eq $text)
{
    Write-Output "No 'mod.enabledmods' entry found in user.cfg."
    Write-Output "Enable the mod in Settings -> Mod Selection, or add 'rules' to that entry."
    exit 0
}

[System.IO.File]::WriteAllText($userCfg, $updated, (New-Object System.Text.UTF8Encoding($false)))
Write-Output "Enabled the mod in '$userCfg':"
Get-Content $userCfg | Select-String -Pattern 'mod\.enabledmods' | ForEach-Object { Write-Output "  $_" }
Write-Output "Start 0 A.D. and open the 'Player' tab of the Match Setup."
