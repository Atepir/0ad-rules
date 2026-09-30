#requires -Version 5.1
<#
.SYNOPSIS
    Verifies the rules mod against the installed 0 A.D. copy.

.DESCRIPTION
    1. Dumps the unit templates of binaries/data/mods/public/public.zip and the classes every
       one of them inherits (tools/dump-unit-classes.py).
    2. Runs tools/verify-unitbanlist.js on that dump, which replays the mod's unit grouping and
       its class matching, and checks the invariants the Match Setup and the simulation rely on.
    3. Runs tools/verify-matchsettingslayout.js, which replays the Match Setup layout repair.
    4. Runs tools/verify-disabled-researches.py, which works out from the same game data which
       researches the mod hides when a class of units is disabled.
    5. Syntax-checks every JavaScript file of the mod.

.PARAMETER GameDirectory
    The 0 A.D. installation directory, i.e. the folder containing "binaries".
#>
param(
    [string]$GameDirectory = "E:\0ad\0 A.D. alpha"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression.FileSystem

$root = Split-Path $PSScriptRoot -Parent
# The mod is the repository root; only the helper folders are not part of it.
$modDirectory = $root
$zipPath = Join-Path $GameDirectory "binaries\data\mods\public\public.zip"

if (-not (Test-Path $zipPath))
{
    throw "public.zip not found at '$zipPath'. Pass -GameDirectory."
}

# 1) Dump the unit templates and the classes they inherit.
$dump = Join-Path $env:TEMP "rules-unit-classes.txt"
& python (Join-Path $root "tools\dump-unit-classes.py") $zipPath $dump
if ($LASTEXITCODE -ne 0)
{
    throw "dump-unit-classes.py failed."
}

# 2) Check the grouping and the classes.
& node (Join-Path $root "tools\verify-unitbanlist.js") $dump
if ($LASTEXITCODE -ne 0)
{
    throw "verify-unitbanlist.js failed."
}

# 3) Check the Match Setup layout helper.
& node (Join-Path $root "tools\verify-matchsettingslayout.js")
if ($LASTEXITCODE -ne 0)
{
    throw "verify-matchsettingslayout.js failed."
}

# 4) Check the researches hidden with the disabled classes.
Write-Output ""
& python (Join-Path $root "tools\verify-disabled-researches.py") $zipPath
if ($LASTEXITCODE -ne 0)
{
    throw "verify-disabled-researches.py failed."
}

# 5) Syntax-check the mod.
Write-Output ""
Write-Output "Syntax check:"
$failed = 0
foreach ($file in (Get-ChildItem $modDirectory -Recurse -File -Include *.js |
        Where-Object { $_.FullName -notmatch '\\(tools|\.github|\.git|\.dist|output)\\' }))
{
    & node --check $file.FullName 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0)
    {
        Write-Output "  OK   $($file.Name)"
    }
    else
    {
        Write-Output "  FAIL $($file.Name)"
        $failed = $failed + 1
    }
}

if ($failed -gt 0)
{
    throw "$failed file(s) failed the syntax check."
}

Write-Output ""
Write-Output "All checks passed."
