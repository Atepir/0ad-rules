#requires -Version 5.1
<#
.SYNOPSIS
    Verifies the rules mod against the installed 0 A.D. copy.

.DESCRIPTION
    1. Dumps the list of shipped unit templates out of binaries/data/mods/public/public.zip.
    2. Runs tools/verify-unitbanlist.js on that dump, which replays the mod's unit grouping
       logic and checks the invariants the GUI and the simulation rely on.
    3. Syntax-checks every JavaScript file of the mod.

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

# 1) Dump the shipped unit templates.
$dump = Join-Path $env:TEMP "rules-unit-templates.txt"
$zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
$entries = $zip.Entries |
    Where-Object { $_.FullName -match '^simulation/templates/units/.*\.xml$' } |
    ForEach-Object { $_.FullName }
$zip.Dispose()
Set-Content -Path $dump -Value $entries -Encoding ASCII
Write-Output "Dumped $($entries.Count) unit template paths to '$dump'."

# 2) Check the grouping logic.
& node (Join-Path $root "tools\verify-unitbanlist.js") $dump
if ($LASTEXITCODE -ne 0)
{
    throw "verify-unitbanlist.js failed."
}

# 3) Syntax-check the mod.
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
